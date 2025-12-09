import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = join(__dirname, "..", "..");
const BARE_REPO = join(ROOT_DIR, ".bare-repo");
const WORKTREES_DIR = join(ROOT_DIR, "worktrees");

function exec(cmd, cwd = ROOT_DIR) {
  try {
    return execSync(cmd, { cwd, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }).trim();
  } catch (err) {
    throw new Error(err.stderr || err.message);
  }
}

function isInitialized() {
  return existsSync(BARE_REPO);
}

export const gitModule = {
  name: "git",
  description: "Git worktree management tools",

  tools: [
    {
      name: "git_init_repo",
      description: "Initialize the worktree manager with a git repository URL. This clones the repo as a bare repository.",
      inputSchema: {
        type: "object",
        properties: {
          url: {
            type: "string",
            description: "Git repository URL (e.g., https://github.com/user/repo.git)",
          },
        },
        required: ["url"],
      },
      handler: async ({ url }) => {
        if (isInitialized()) {
          return { error: "Repository already initialized. Remove .bare-repo to reinitialize." };
        }

        exec(`git clone --bare "${url}" "${BARE_REPO}"`);
        exec(`git config remote.origin.fetch "+refs/heads/*:refs/remotes/origin/*"`, BARE_REPO);
        exec("git fetch origin", BARE_REPO);

        return {
          success: true,
          message: `Repository initialized from ${url}`,
          bareRepo: BARE_REPO,
        };
      },
    },

    {
      name: "git_create_worktree",
      description: "Create a new git worktree for a branch. If the branch doesn't exist, it will be created from the default branch.",
      inputSchema: {
        type: "object",
        properties: {
          branch: {
            type: "string",
            description: "Branch name (e.g., feature/auth, fix/login-bug)",
          },
          directory: {
            type: "string",
            description: "Optional custom directory name (defaults to branch name with / replaced by -)",
          },
        },
        required: ["branch"],
      },
      handler: async ({ branch, directory }) => {
        if (!isInitialized()) {
          return { error: "Repository not initialized. Run git_init_repo first." };
        }

        const dirName = directory || branch.replace(/\//g, "-");
        const worktreePath = join(WORKTREES_DIR, dirName);

        if (existsSync(worktreePath)) {
          return { error: `Worktree already exists at ${worktreePath}` };
        }

        exec("git fetch origin", BARE_REPO);

        const branchExists = (() => {
          try {
            exec(`git show-ref --verify refs/heads/${branch}`, BARE_REPO);
            return true;
          } catch {
            try {
              exec(`git show-ref --verify refs/remotes/origin/${branch}`, BARE_REPO);
              return true;
            } catch {
              return false;
            }
          }
        })();

        if (branchExists) {
          exec(`git worktree add "${worktreePath}" "${branch}"`, BARE_REPO);
        } else {
          let defaultBranch = "main";
          try {
            defaultBranch = exec("git symbolic-ref refs/remotes/origin/HEAD", BARE_REPO)
              .replace("refs/remotes/origin/", "");
          } catch {}
          exec(`git worktree add -b "${branch}" "${worktreePath}" "origin/${defaultBranch}"`, BARE_REPO);
        }

        return {
          success: true,
          branch,
          path: worktreePath,
          message: `Worktree created at ${worktreePath}`,
        };
      },
    },

    {
      name: "git_list_worktrees",
      description: "List all active git worktrees with their branches and paths.",
      inputSchema: {
        type: "object",
        properties: {},
      },
      handler: async () => {
        if (!isInitialized()) {
          return { error: "Repository not initialized. Run git_init_repo first." };
        }

        const output = exec("git worktree list --porcelain", BARE_REPO);
        const worktrees = [];
        let current = {};

        for (const line of output.split("\n")) {
          if (line.startsWith("worktree ")) {
            if (current.path) worktrees.push(current);
            current = { path: line.replace("worktree ", "") };
          } else if (line.startsWith("branch ")) {
            current.branch = line.replace("branch refs/heads/", "");
          } else if (line === "bare") {
            current.isBare = true;
          }
        }
        if (current.path) worktrees.push(current);

        return {
          worktrees: worktrees.filter(w => !w.isBare),
          count: worktrees.filter(w => !w.isBare).length,
        };
      },
    },

    {
      name: "git_remove_worktree",
      description: "Remove a git worktree by its directory name.",
      inputSchema: {
        type: "object",
        properties: {
          directory: {
            type: "string",
            description: "Worktree directory name (e.g., feature-auth)",
          },
          force: {
            type: "boolean",
            description: "Force removal even if there are uncommitted changes",
          },
        },
        required: ["directory"],
      },
      handler: async ({ directory, force }) => {
        if (!isInitialized()) {
          return { error: "Repository not initialized." };
        }

        const worktreePath = join(WORKTREES_DIR, directory);
        if (!existsSync(worktreePath)) {
          return { error: `Worktree not found: ${worktreePath}` };
        }

        const forceFlag = force ? " --force" : "";
        exec(`git worktree remove "${worktreePath}"${forceFlag}`, BARE_REPO);

        return {
          success: true,
          message: `Worktree removed: ${directory}`,
        };
      },
    },

    {
      name: "git_sync",
      description: "Fetch latest changes from the remote repository.",
      inputSchema: {
        type: "object",
        properties: {},
      },
      handler: async () => {
        if (!isInitialized()) {
          return { error: "Repository not initialized." };
        }

        exec("git fetch origin --prune", BARE_REPO);

        return {
          success: true,
          message: "Fetched latest changes from remote",
        };
      },
    },

    {
      name: "git_worktree_status",
      description: "Get the git status of a specific worktree.",
      inputSchema: {
        type: "object",
        properties: {
          directory: {
            type: "string",
            description: "Worktree directory name",
          },
        },
        required: ["directory"],
      },
      handler: async ({ directory }) => {
        const worktreePath = join(WORKTREES_DIR, directory);
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
          directory: {
            type: "string",
            description: "Worktree directory name",
          },
          message: {
            type: "string",
            description: "Commit message",
          },
        },
        required: ["directory", "message"],
      },
      handler: async ({ directory, message }) => {
        const worktreePath = join(WORKTREES_DIR, directory);
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
          directory: {
            type: "string",
            description: "Worktree directory name",
          },
          setUpstream: {
            type: "boolean",
            description: "Set upstream tracking (use for new branches)",
          },
        },
        required: ["directory"],
      },
      handler: async ({ directory, setUpstream }) => {
        const worktreePath = join(WORKTREES_DIR, directory);
        if (!existsSync(worktreePath)) {
          return { error: `Worktree not found: ${worktreePath}` };
        }

        const branch = exec("git branch --show-current", worktreePath);
        const upstreamFlag = setUpstream ? ` -u origin ${branch}` : "";

        exec(`git push${upstreamFlag}`, worktreePath);

        return {
          success: true,
          message: `Pushed ${branch} to remote`,
        };
      },
    },
  ],
};
