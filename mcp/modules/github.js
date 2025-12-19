import { execSync } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync, readFileSync, writeFileSync } from "node:fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = join(__dirname, "..", "..");
const REPOS_DIR = join(ROOT_DIR, "repos");
const REPO_MAP_FILE = join(ROOT_DIR, "repos", ".repo-map.json");

function exec(cmd, cwd = ROOT_DIR) {
  try {
    return execSync(cmd, { cwd, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"], maxBuffer: 10 * 1024 * 1024 }).trim();
  } catch (err) {
    throw new Error(err.stderr || err.message);
  }
}

function loadRepoMap() {
  try {
    if (existsSync(REPO_MAP_FILE)) {
      return JSON.parse(readFileSync(REPO_MAP_FILE, "utf8"));
    }
  } catch {}
  return {};
}

function saveRepoMap(map) {
  writeFileSync(REPO_MAP_FILE, JSON.stringify(map, null, 2));
}

function getGitHubRepoInfo(localRepoName) {
  const map = loadRepoMap();
  if (map[localRepoName]) {
    return map[localRepoName];
  }

  const bareRepoPath = join(REPOS_DIR, localRepoName, ".bare");
  if (!existsSync(bareRepoPath)) {
    return null;
  }

  try {
    const remoteUrl = exec("git remote get-url origin", bareRepoPath);
    const match = remoteUrl.match(/github\.com[:/]([^/]+)\/([^/.]+)(\.git)?$/);
    if (match) {
      const [, owner, repoName] = match;
      map[localRepoName] = { owner, repo: repoName };
      saveRepoMap(map);
      return { owner, repo: repoName };
    }
  } catch {}

  return null;
}

function resolveRepo(localRepoName, providedOwner) {
  const resolved = getGitHubRepoInfo(localRepoName);
  if (resolved) {
    return {
      owner: providedOwner || resolved.owner,
      repo: resolved.repo,
    };
  }
  return null;
}

function ghApi(endpoint, method = "GET", data = null) {
  let cmd = `gh api ${endpoint}`;
  if (method !== "GET") {
    cmd = `gh api -X ${method} ${endpoint}`;
  }
  if (data) {
    cmd = `gh api -X ${method} ${endpoint} --input -`;
    try {
      return JSON.parse(execSync(cmd, {
        input: JSON.stringify(data),
        encoding: "utf8",
        stdio: ["pipe", "pipe", "pipe"],
        maxBuffer: 10 * 1024 * 1024
      }).trim());
    } catch (err) {
      throw new Error(err.stderr || err.message);
    }
  }
  try {
    return JSON.parse(exec(cmd));
  } catch (err) {
    if (err.message.includes("SyntaxError")) {
      return exec(cmd);
    }
    throw err;
  }
}

function getWorktreePath(repo, directory) {
  return join(REPOS_DIR, repo, "worktrees", directory);
}

export const githubModule = {
  name: "github",
  description: "GitHub operations for repositories managed via worktrees",

  tools: [
    {
      name: "github_create_pr",
      description: "Create a pull request from a worktree branch. Uses the worktree's current branch as head. Auto-resolves local repo names to GitHub owner/repo from git remote.",
      inputSchema: {
        type: "object",
        properties: {
          repo: {
            type: "string",
            description: "Local worktree repo name (e.g., 'myapp'). Auto-resolved to GitHub repo from git remote.",
          },
          directory: {
            type: "string",
            description: "Worktree directory name (e.g., 'feature-auth')",
          },
          title: {
            type: "string",
            description: "PR title",
          },
          body: {
            type: "string",
            description: "PR description/body",
          },
          base: {
            type: "string",
            description: "Base branch (default: 'main')",
          },
          owner: {
            type: "string",
            description: "GitHub owner/org (optional, auto-detected from remote)",
          },
          draft: {
            type: "boolean",
            description: "Create as draft PR",
          },
        },
        required: ["repo", "directory", "title"],
      },
      handler: async ({ repo: localRepo, directory, title, body, base = "main", owner, draft = false }) => {
        const worktreePath = getWorktreePath(localRepo, directory);

        if (!existsSync(worktreePath)) {
          return { error: `Worktree not found: ${worktreePath}` };
        }

        const resolved = resolveRepo(localRepo, owner);
        if (!resolved) {
          return { error: `Could not resolve GitHub repo for '${localRepo}'. Ensure it has a GitHub remote or provide owner.` };
        }

        const { owner: resolvedOwner, repo: ghRepo } = resolved;
        const head = exec("git branch --show-current", worktreePath);

        if (!head) {
          return { error: "Could not determine current branch in worktree" };
        }

        const prBody = body || "";
        const draftFlag = draft ? "--draft" : "";

        const cmd = `gh pr create --repo "${resolvedOwner}/${ghRepo}" --title "${title.replace(/"/g, '\\"')}" --body "${prBody.replace(/"/g, '\\"')}" --head "${head}" --base "${base}" ${draftFlag}`.trim();

        try {
          const result = exec(cmd, worktreePath);
          const prUrl = result.match(/https:\/\/github\.com\/[^\s]+/)?.[0] || result;
          const prNumber = prUrl.match(/\/pull\/(\d+)/)?.[1];

          return {
            success: true,
            localRepo,
            repo: ghRepo,
            owner: resolvedOwner,
            url: prUrl,
            number: prNumber ? parseInt(prNumber) : null,
            head,
            base,
            title,
            message: `PR created: ${prUrl}`,
          };
        } catch (err) {
          if (err.message.includes("already exists")) {
            const existingPr = exec(`gh pr view --repo "${resolvedOwner}/${ghRepo}" --json url,number`, worktreePath);
            const parsed = JSON.parse(existingPr);
            return {
              success: true,
              localRepo,
              repo: ghRepo,
              owner: resolvedOwner,
              url: parsed.url,
              number: parsed.number,
              head,
              base,
              title,
              message: `PR already exists: ${parsed.url}`,
              existing: true,
            };
          }
          throw err;
        }
      },
    },

    {
      name: "github_list_prs",
      description: "List pull requests for a repository.",
      inputSchema: {
        type: "object",
        properties: {
          repo: {
            type: "string",
            description: "Repository name",
          },
          owner: {
            type: "string",
            description: "GitHub owner/org (optional, auto-detected)",
          },
          state: {
            type: "string",
            description: "PR state: 'open', 'closed', 'merged', 'all' (default: 'open')",
          },
          limit: {
            type: "number",
            description: "Maximum number of PRs to return (default: 30)",
          },
        },
        required: ["repo"],
      },
      handler: async ({ repo: localRepo, owner, state = "open", limit = 30 }) => {
        const resolved = resolveRepo(localRepo, owner);
        if (!resolved) {
          return { error: `Could not resolve GitHub repo for '${localRepo}'.` };
        }

        const { owner: resolvedOwner, repo: ghRepo } = resolved;
        const stateFlag = state === "all" ? "--state all" : `--state ${state}`;
        const cmd = `gh pr list --repo "${resolvedOwner}/${ghRepo}" ${stateFlag} --limit ${limit} --json number,title,state,headRefName,baseRefName,url,author,createdAt`;

        const result = JSON.parse(exec(cmd));

        return {
          localRepo,
          repo: ghRepo,
          owner: resolvedOwner,
          state,
          pullRequests: result,
          count: result.length,
        };
      },
    },

    {
      name: "github_get_pr",
      description: "Get details of a specific pull request.",
      inputSchema: {
        type: "object",
        properties: {
          repo: {
            type: "string",
            description: "Repository name",
          },
          number: {
            type: "number",
            description: "PR number",
          },
          owner: {
            type: "string",
            description: "GitHub owner/org (optional, auto-detected)",
          },
        },
        required: ["repo", "number"],
      },
      handler: async ({ repo: localRepo, number, owner }) => {
        const resolved = resolveRepo(localRepo, owner);
        if (!resolved) {
          return { error: `Could not resolve GitHub repo for '${localRepo}'.` };
        }

        const { owner: resolvedOwner, repo: ghRepo } = resolved;
        const cmd = `gh pr view ${number} --repo "${resolvedOwner}/${ghRepo}" --json number,title,body,state,headRefName,baseRefName,url,author,createdAt,mergedAt,mergeable,additions,deletions,changedFiles,commits,reviewDecision,statusCheckRollup`;

        const result = JSON.parse(exec(cmd));

        return {
          localRepo,
          repo: ghRepo,
          owner: resolvedOwner,
          ...result,
        };
      },
    },

    {
      name: "github_merge_pr",
      description: "Merge a pull request.",
      inputSchema: {
        type: "object",
        properties: {
          repo: {
            type: "string",
            description: "Repository name",
          },
          number: {
            type: "number",
            description: "PR number",
          },
          owner: {
            type: "string",
            description: "GitHub owner/org (optional, auto-detected)",
          },
          method: {
            type: "string",
            description: "Merge method: 'merge', 'squash', 'rebase' (default: 'squash')",
          },
          deleteHead: {
            type: "boolean",
            description: "Delete the head branch after merging (default: true)",
          },
        },
        required: ["repo", "number"],
      },
      handler: async ({ repo: localRepo, number, owner, method = "squash", deleteHead = true }) => {
        const resolved = resolveRepo(localRepo, owner);
        if (!resolved) {
          return { error: `Could not resolve GitHub repo for '${localRepo}'.` };
        }

        const { owner: resolvedOwner, repo: ghRepo } = resolved;
        const methodFlag = `--${method}`;
        const deleteFlag = deleteHead ? "--delete-branch" : "";
        const cmd = `gh pr merge ${number} --repo "${resolvedOwner}/${ghRepo}" ${methodFlag} ${deleteFlag}`.trim();

        exec(cmd);

        return {
          success: true,
          localRepo,
          repo: ghRepo,
          owner: resolvedOwner,
          number,
          method,
          message: `PR #${number} merged successfully`,
        };
      },
    },

    {
      name: "github_pr_checks",
      description: "Get the status of CI checks for a pull request.",
      inputSchema: {
        type: "object",
        properties: {
          repo: {
            type: "string",
            description: "Repository name",
          },
          number: {
            type: "number",
            description: "PR number",
          },
          owner: {
            type: "string",
            description: "GitHub owner/org (optional, auto-detected)",
          },
        },
        required: ["repo", "number"],
      },
      handler: async ({ repo: localRepo, number, owner }) => {
        const resolved = resolveRepo(localRepo, owner);
        if (!resolved) {
          return { error: `Could not resolve GitHub repo for '${localRepo}'.` };
        }

        const { owner: resolvedOwner, repo: ghRepo } = resolved;
        const cmd = `gh pr view ${number} --repo "${resolvedOwner}/${ghRepo}" --json statusCheckRollup`;

        try {
          const result = JSON.parse(exec(cmd));
          const checks = result.statusCheckRollup || [];

          const allPassed = checks.length === 0 || checks.every(c =>
            c.conclusion === "SUCCESS" || c.conclusion === "SKIPPED" || c.conclusion === "NEUTRAL"
          );
          const anyFailed = checks.some(c => c.conclusion === "FAILURE");
          const anyPending = checks.some(c =>
            c.status === "PENDING" || c.status === "IN_PROGRESS" || c.status === "QUEUED" || !c.conclusion
          );

          return {
            localRepo,
            repo: ghRepo,
            owner: resolvedOwner,
            number,
            checks: checks.map(c => ({
              name: c.name || c.context,
              status: c.status,
              conclusion: c.conclusion,
              url: c.detailsUrl || c.targetUrl,
            })),
            summary: {
              total: checks.length,
              passed: checks.filter(c => c.conclusion === "SUCCESS").length,
              failed: checks.filter(c => c.conclusion === "FAILURE").length,
              pending: checks.filter(c => !c.conclusion || c.status === "PENDING" || c.status === "IN_PROGRESS").length,
              skipped: checks.filter(c => c.conclusion === "SKIPPED" || c.conclusion === "NEUTRAL").length,
            },
            allPassed,
            anyFailed,
            anyPending,
          };
        } catch (err) {
          if (err.message.includes("no checks") || err.message.includes("Could not resolve")) {
            return {
              localRepo,
              repo: ghRepo,
              owner: resolvedOwner,
              number,
              checks: [],
              summary: { total: 0, passed: 0, failed: 0, pending: 0, skipped: 0 },
              allPassed: true,
              anyFailed: false,
              anyPending: false,
              message: "No CI checks configured for this PR",
            };
          }
          throw err;
        }
      },
    },

    {
      name: "github_list_branches",
      description: "List branches for a repository.",
      inputSchema: {
        type: "object",
        properties: {
          repo: {
            type: "string",
            description: "Repository name",
          },
          owner: {
            type: "string",
            description: "GitHub owner/org (optional, auto-detected)",
          },
          limit: {
            type: "number",
            description: "Maximum number of branches (default: 30)",
          },
        },
        required: ["repo"],
      },
      handler: async ({ repo: localRepo, owner, limit = 30 }) => {
        const resolved = resolveRepo(localRepo, owner);
        if (!resolved) {
          return { error: `Could not resolve GitHub repo for '${localRepo}'.` };
        }

        const { owner: resolvedOwner, repo: ghRepo } = resolved;
        const result = ghApi(`repos/${resolvedOwner}/${ghRepo}/branches?per_page=${limit}`);

        return {
          localRepo,
          repo: ghRepo,
          owner: resolvedOwner,
          branches: result.map(b => ({
            name: b.name,
            protected: b.protected,
          })),
          count: result.length,
        };
      },
    },

    {
      name: "github_create_issue",
      description: "Create a GitHub issue.",
      inputSchema: {
        type: "object",
        properties: {
          repo: {
            type: "string",
            description: "Repository name",
          },
          title: {
            type: "string",
            description: "Issue title",
          },
          body: {
            type: "string",
            description: "Issue body",
          },
          owner: {
            type: "string",
            description: "GitHub owner/org (optional, auto-detected)",
          },
          labels: {
            type: "array",
            items: { type: "string" },
            description: "Labels to add",
          },
        },
        required: ["repo", "title"],
      },
      handler: async ({ repo: localRepo, title, body = "", owner, labels = [] }) => {
        const resolved = resolveRepo(localRepo, owner);
        if (!resolved) {
          return { error: `Could not resolve GitHub repo for '${localRepo}'.` };
        }

        const { owner: resolvedOwner, repo: ghRepo } = resolved;
        let cmd = `gh issue create --repo "${resolvedOwner}/${ghRepo}" --title "${title.replace(/"/g, '\\"')}" --body "${body.replace(/"/g, '\\"')}"`;

        if (labels.length > 0) {
          cmd += ` --label "${labels.join(",")}"`;
        }

        const result = exec(cmd);
        const issueUrl = result.match(/https:\/\/github\.com\/[^\s]+/)?.[0] || result;
        const issueNumber = issueUrl.match(/\/issues\/(\d+)/)?.[1];

        return {
          success: true,
          localRepo,
          repo: ghRepo,
          owner: resolvedOwner,
          url: issueUrl,
          number: issueNumber ? parseInt(issueNumber) : null,
          title,
          message: `Issue created: ${issueUrl}`,
        };
      },
    },

    {
      name: "github_list_issues",
      description: "List issues for a repository.",
      inputSchema: {
        type: "object",
        properties: {
          repo: {
            type: "string",
            description: "Repository name",
          },
          owner: {
            type: "string",
            description: "GitHub owner/org (optional, auto-detected)",
          },
          state: {
            type: "string",
            description: "Issue state: 'open', 'closed', 'all' (default: 'open')",
          },
          limit: {
            type: "number",
            description: "Maximum issues to return (default: 30)",
          },
        },
        required: ["repo"],
      },
      handler: async ({ repo: localRepo, owner, state = "open", limit = 30 }) => {
        const resolved = resolveRepo(localRepo, owner);
        if (!resolved) {
          return { error: `Could not resolve GitHub repo for '${localRepo}'.` };
        }

        const { owner: resolvedOwner, repo: ghRepo } = resolved;
        const stateFlag = state === "all" ? "--state all" : `--state ${state}`;
        const cmd = `gh issue list --repo "${resolvedOwner}/${ghRepo}" ${stateFlag} --limit ${limit} --json number,title,state,url,author,createdAt,labels`;

        const result = JSON.parse(exec(cmd));

        return {
          localRepo,
          repo: ghRepo,
          owner: resolvedOwner,
          state,
          issues: result,
          count: result.length,
        };
      },
    },

    {
      name: "github_add_comment",
      description: "Add a comment to a PR or issue.",
      inputSchema: {
        type: "object",
        properties: {
          repo: {
            type: "string",
            description: "Repository name",
          },
          number: {
            type: "number",
            description: "PR or issue number",
          },
          body: {
            type: "string",
            description: "Comment body",
          },
          owner: {
            type: "string",
            description: "GitHub owner/org (optional, auto-detected)",
          },
          isPR: {
            type: "boolean",
            description: "True if commenting on a PR, false for issue (default: true)",
          },
        },
        required: ["repo", "number", "body"],
      },
      handler: async ({ repo: localRepo, number, body, owner, isPR = true }) => {
        const resolved = resolveRepo(localRepo, owner);
        if (!resolved) {
          return { error: `Could not resolve GitHub repo for '${localRepo}'.` };
        }

        const { owner: resolvedOwner, repo: ghRepo } = resolved;
        const type = isPR ? "pr" : "issue";
        const cmd = `gh ${type} comment ${number} --repo "${resolvedOwner}/${ghRepo}" --body "${body.replace(/"/g, '\\"')}"`;

        exec(cmd);

        return {
          success: true,
          localRepo,
          repo: ghRepo,
          owner: resolvedOwner,
          number,
          type,
          message: `Comment added to ${type} #${number}`,
        };
      },
    },

    {
      name: "github_close_pr",
      description: "Close a pull request without merging.",
      inputSchema: {
        type: "object",
        properties: {
          repo: {
            type: "string",
            description: "Repository name",
          },
          number: {
            type: "number",
            description: "PR number",
          },
          owner: {
            type: "string",
            description: "GitHub owner/org (optional, auto-detected)",
          },
          comment: {
            type: "string",
            description: "Optional comment to add before closing",
          },
        },
        required: ["repo", "number"],
      },
      handler: async ({ repo: localRepo, number, owner, comment }) => {
        const resolved = resolveRepo(localRepo, owner);
        if (!resolved) {
          return { error: `Could not resolve GitHub repo for '${localRepo}'.` };
        }

        const { owner: resolvedOwner, repo: ghRepo } = resolved;
        if (comment) {
          exec(`gh pr comment ${number} --repo "${resolvedOwner}/${ghRepo}" --body "${comment.replace(/"/g, '\\"')}"`);
        }

        exec(`gh pr close ${number} --repo "${resolvedOwner}/${ghRepo}"`);

        return {
          success: true,
          localRepo,
          repo: ghRepo,
          owner: resolvedOwner,
          number,
          message: `PR #${number} closed`,
        };
      },
    },

    {
      name: "github_repo_info",
      description: "Get information about a repository.",
      inputSchema: {
        type: "object",
        properties: {
          repo: {
            type: "string",
            description: "Repository name",
          },
          owner: {
            type: "string",
            description: "GitHub owner/org (optional, auto-detected)",
          },
        },
        required: ["repo"],
      },
      handler: async ({ repo: localRepo, owner }) => {
        const resolved = resolveRepo(localRepo, owner);
        if (!resolved) {
          return { error: `Could not resolve GitHub repo for '${localRepo}'.` };
        }

        const { owner: resolvedOwner, repo: ghRepo } = resolved;
        const cmd = `gh repo view "${resolvedOwner}/${ghRepo}" --json name,description,url,defaultBranchRef,isPrivate,isFork,createdAt,updatedAt,pushedAt,diskUsage,stargazerCount,forkCount`;

        const result = JSON.parse(exec(cmd));

        return {
          localRepo,
          repo: ghRepo,
          owner: resolvedOwner,
          ...result,
          defaultBranch: result.defaultBranchRef?.name,
        };
      },
    },

    {
      name: "github_repo_map",
      description: "View or update the local-to-GitHub repo name mapping. Auto-discovered from git remotes.",
      inputSchema: {
        type: "object",
        properties: {
          localName: {
            type: "string",
            description: "Local repo name to query or update",
          },
          githubRepo: {
            type: "string",
            description: "GitHub repo name to set for the local name (optional)",
          },
          githubOwner: {
            type: "string",
            description: "GitHub owner to set (optional)",
          },
        },
      },
      handler: async ({ localName, githubRepo, githubOwner }) => {
        const map = loadRepoMap();

        if (localName && githubRepo && githubOwner) {
          map[localName] = {
            owner: githubOwner,
            repo: githubRepo,
          };
          saveRepoMap(map);
          return {
            success: true,
            message: `Mapped '${localName}' -> '${githubOwner}/${githubRepo}'`,
            mapping: map,
          };
        }

        if (localName) {
          const resolved = resolveRepo(localName);
          if (resolved) {
            return {
              localName,
              resolved,
              message: `'${localName}' resolves to '${resolved.owner}/${resolved.repo}'`,
            };
          }
          return {
            localName,
            resolved: null,
            message: `'${localName}' has no GitHub mapping. Initialize a repo with a GitHub remote first.`,
          };
        }

        return {
          mapping: map,
          count: Object.keys(map).length,
          message: "Current repo name mappings (local -> GitHub)",
        };
      },
    },
  ],
};
