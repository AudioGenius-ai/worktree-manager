import { execSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = join(__dirname, "..", "..");
const REPOS_DIR = join(ROOT_DIR, "repos");

function exec(cmd, cwd = ROOT_DIR) {
  try {
    return execSync(cmd, { cwd, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }).trim();
  } catch (err) {
    throw new Error(err.stderr || err.message);
  }
}

function getRepoDir(repoName) {
  return join(REPOS_DIR, repoName);
}

function getBareRepoDir(repoName) {
  return join(getRepoDir(repoName), ".bare");
}

function getWorktreesDir(repoName) {
  return join(getRepoDir(repoName), "worktrees");
}

function isRepoInitialized(repoName) {
  return existsSync(getBareRepoDir(repoName));
}

function listRepos() {
  if (!existsSync(REPOS_DIR)) return [];
  return readdirSync(REPOS_DIR, { withFileTypes: true })
    .filter(d => d.isDirectory() && existsSync(join(REPOS_DIR, d.name, ".bare")))
    .map(d => d.name);
}

export const gitModule = {
  name: "git",
  description: "Git worktree management tools for multiple repositories",

  tools: [
    {
      name: "git_init_repo",
      description: "Initialize a repository for worktree management. Each repo gets its own namespace.",
      inputSchema: {
        type: "object",
        properties: {
          name: {
            type: "string",
            description: "Short name for the repo (e.g., 'launchpad', 'myapp')",
          },
          url: {
            type: "string",
            description: "Git repository URL",
          },
        },
        required: ["name", "url"],
      },
      handler: async ({ name, url }) => {
        if (isRepoInitialized(name)) {
          return { error: `Repository '${name}' already initialized.` };
        }

        const repoDir = getRepoDir(name);
        const bareRepo = getBareRepoDir(name);
        const worktreesDir = getWorktreesDir(name);

        mkdirSync(repoDir, { recursive: true });
        mkdirSync(worktreesDir, { recursive: true });

        exec(`git clone --bare "${url}" "${bareRepo}"`);
        exec(`git config remote.origin.fetch "+refs/heads/*:refs/remotes/origin/*"`, bareRepo);
        exec("git fetch origin", bareRepo);

        return {
          success: true,
          repo: name,
          message: `Repository '${name}' initialized from ${url}`,
          path: repoDir,
        };
      },
    },

    {
      name: "git_list_repos",
      description: "List all initialized repositories.",
      inputSchema: {
        type: "object",
        properties: {},
      },
      handler: async () => {
        const repos = listRepos();
        return {
          repos,
          count: repos.length,
        };
      },
    },

    {
      name: "git_create_worktree",
      description: "Create a new git worktree for a branch in a specific repository.",
      inputSchema: {
        type: "object",
        properties: {
          repo: {
            type: "string",
            description: "Repository name (e.g., 'launchpad')",
          },
          branch: {
            type: "string",
            description: "Branch name (e.g., feature/auth, fix/login-bug)",
          },
          directory: {
            type: "string",
            description: "Optional custom directory name (defaults to branch name with / replaced by -)",
          },
        },
        required: ["repo", "branch"],
      },
      handler: async ({ repo, branch, directory }) => {
        if (!isRepoInitialized(repo)) {
          return { error: `Repository '${repo}' not initialized. Run git_init_repo first.` };
        }

        const bareRepo = getBareRepoDir(repo);
        const worktreesDir = getWorktreesDir(repo);
        const dirName = directory || branch.replace(/\//g, "-");
        const worktreePath = join(worktreesDir, dirName);

        if (existsSync(worktreePath)) {
          return { error: `Worktree already exists at ${worktreePath}` };
        }

        exec("git fetch origin", bareRepo);

        const branchExists = (() => {
          try {
            exec(`git show-ref --verify refs/heads/${branch}`, bareRepo);
            return true;
          } catch {
            try {
              exec(`git show-ref --verify refs/remotes/origin/${branch}`, bareRepo);
              return true;
            } catch {
              return false;
            }
          }
        })();

        if (branchExists) {
          exec(`git worktree add "${worktreePath}" "${branch}"`, bareRepo);
        } else {
          let defaultBranch = "main";
          try {
            defaultBranch = exec("git symbolic-ref refs/remotes/origin/HEAD", bareRepo)
              .replace("refs/remotes/origin/", "");
          } catch {}
          exec(`git worktree add -b "${branch}" "${worktreePath}" "origin/${defaultBranch}"`, bareRepo);
        }

        return {
          success: true,
          repo,
          branch,
          path: worktreePath,
          message: `Worktree created at ${worktreePath}`,
        };
      },
    },

    {
      name: "git_list_worktrees",
      description: "List all active git worktrees, optionally filtered by repository.",
      inputSchema: {
        type: "object",
        properties: {
          repo: {
            type: "string",
            description: "Optional: filter by repository name",
          },
        },
      },
      handler: async ({ repo }) => {
        const repos = repo ? [repo] : listRepos();
        const allWorktrees = [];

        for (const r of repos) {
          if (!isRepoInitialized(r)) continue;

          const bareRepo = getBareRepoDir(r);
          const output = exec("git worktree list --porcelain", bareRepo);
          let current = {};

          for (const line of output.split("\n")) {
            if (line.startsWith("worktree ")) {
              if (current.path) allWorktrees.push({ ...current, repo: r });
              current = { path: line.replace("worktree ", "") };
            } else if (line.startsWith("branch ")) {
              current.branch = line.replace("branch refs/heads/", "");
            } else if (line === "bare") {
              current.isBare = true;
            }
          }
          if (current.path) allWorktrees.push({ ...current, repo: r });
        }

        const worktrees = allWorktrees.filter(w => !w.isBare);

        return {
          worktrees,
          count: worktrees.length,
        };
      },
    },

    {
      name: "git_remove_worktree",
      description: "Remove a git worktree.",
      inputSchema: {
        type: "object",
        properties: {
          repo: {
            type: "string",
            description: "Repository name",
          },
          directory: {
            type: "string",
            description: "Worktree directory name (e.g., feature-auth)",
          },
          force: {
            type: "boolean",
            description: "Force removal even if there are uncommitted changes",
          },
        },
        required: ["repo", "directory"],
      },
      handler: async ({ repo, directory, force }) => {
        if (!isRepoInitialized(repo)) {
          return { error: `Repository '${repo}' not initialized.` };
        }

        const bareRepo = getBareRepoDir(repo);
        const worktreePath = join(getWorktreesDir(repo), directory);

        if (!existsSync(worktreePath)) {
          return { error: `Worktree not found: ${worktreePath}` };
        }

        const forceFlag = force ? " --force" : "";
        exec(`git worktree remove "${worktreePath}"${forceFlag}`, bareRepo);

        return {
          success: true,
          message: `Worktree removed: ${repo}/${directory}`,
        };
      },
    },

    {
      name: "git_sync",
      description: "Fetch latest changes from remote for a repository.",
      inputSchema: {
        type: "object",
        properties: {
          repo: {
            type: "string",
            description: "Repository name (or 'all' to sync all repos)",
          },
        },
        required: ["repo"],
      },
      handler: async ({ repo }) => {
        const repos = repo === "all" ? listRepos() : [repo];
        const results = [];

        for (const r of repos) {
          if (!isRepoInitialized(r)) {
            results.push({ repo: r, error: "Not initialized" });
            continue;
          }

          exec("git fetch origin --prune", getBareRepoDir(r));
          results.push({ repo: r, success: true });
        }

        return {
          results,
          message: `Synced ${results.filter(r => r.success).length} repos`,
        };
      },
    },

    {
      name: "git_worktree_status",
      description: "Get the git status of a specific worktree.",
      inputSchema: {
        type: "object",
        properties: {
          repo: {
            type: "string",
            description: "Repository name",
          },
          directory: {
            type: "string",
            description: "Worktree directory name",
          },
        },
        required: ["repo", "directory"],
      },
      handler: async ({ repo, directory }) => {
        const worktreePath = join(getWorktreesDir(repo), directory);
        if (!existsSync(worktreePath)) {
          return { error: `Worktree not found: ${worktreePath}` };
        }

        const status = exec("git status --porcelain", worktreePath);
        const branch = exec("git branch --show-current", worktreePath);
        const ahead = (() => {
          try {
            return exec("git rev-list --count @{u}..HEAD", worktreePath);
          } catch {
            return "unknown";
          }
        })();
        const behind = (() => {
          try {
            return exec("git rev-list --count HEAD..@{u}", worktreePath);
          } catch {
            return "unknown";
          }
        })();

        return {
          repo,
          directory,
          path: worktreePath,
          branch,
          ahead: parseInt(ahead) || 0,
          behind: parseInt(behind) || 0,
          clean: status === "",
          changes: status ? status.split("\n").filter(Boolean) : [],
        };
      },
    },

    {
      name: "git_commit",
      description: "Stage all changes and commit in a worktree.",
      inputSchema: {
        type: "object",
        properties: {
          repo: {
            type: "string",
            description: "Repository name",
          },
          directory: {
            type: "string",
            description: "Worktree directory name",
          },
          message: {
            type: "string",
            description: "Commit message",
          },
        },
        required: ["repo", "directory", "message"],
      },
      handler: async ({ repo, directory, message }) => {
        const worktreePath = join(getWorktreesDir(repo), directory);
        if (!existsSync(worktreePath)) {
          return { error: `Worktree not found: ${worktreePath}` };
        }

        exec("git add -A", worktreePath);

        try {
          exec(`git commit -m "${message.replace(/"/g, '\\"')}"`, worktreePath);
        } catch (err) {
          if (err.message.includes("nothing to commit")) {
            return { success: false, message: "Nothing to commit" };
          }
          throw err;
        }

        const hash = exec("git rev-parse --short HEAD", worktreePath);

        return {
          success: true,
          repo,
          commit: hash,
          message: `Committed: ${hash}`,
        };
      },
    },

    {
      name: "git_push",
      description: "Push commits from a worktree to the remote.",
      inputSchema: {
        type: "object",
        properties: {
          repo: {
            type: "string",
            description: "Repository name",
          },
          directory: {
            type: "string",
            description: "Worktree directory name",
          },
          setUpstream: {
            type: "boolean",
            description: "Set upstream tracking (use for new branches)",
          },
        },
        required: ["repo", "directory"],
      },
      handler: async ({ repo, directory, setUpstream }) => {
        const worktreePath = join(getWorktreesDir(repo), directory);
        if (!existsSync(worktreePath)) {
          return { error: `Worktree not found: ${worktreePath}` };
        }

        const branch = exec("git branch --show-current", worktreePath);
        const upstreamFlag = setUpstream ? ` -u origin ${branch}` : "";

        exec(`git push${upstreamFlag}`, worktreePath);

        return {
          success: true,
          repo,
          message: `Pushed ${branch} to remote`,
        };
      },
    },
  ],
};
