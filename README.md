# Worktree Manager

An MCP-powered orchestration system for Claude Code. Manage multiple repositories with git worktrees, enforce development workflows with hooks, and coordinate AI agents - all from a single project.

Think of it like Gemini's Conductor, but built on Claude Code with full workflow enforcement.

## Features

- **47 MCP Tools** - Git, GitHub, Tasks, Requirements management
- **Git Worktrees** - Parallel feature development in isolated directories
- **Task Tracking** - Create, track, and complete tasks with full traceability
- **Requirements Management** - PRDs, specs, user stories linked to tasks
- **Workflow Hooks** - Enforce rules (can't edit code without a task!)
- **Agent Templates** - Specialized agents for review, testing, security, etc.
- **GitHub Integration** - PRs, issues, branches, CI checks via MCP

## Quick Start

```bash
# Clone the template
git clone https://github.com/AudioGenius-ai/worktree-manager.git my-project
cd my-project
npm install

# Start Claude Code
claude
```

### Add Existing Projects

Bring in repos you're already working on:
```
git_init_repo { name: "myapp", url: "https://github.com/org/myapp.git" }
git_init_repo { name: "backend", url: "https://github.com/org/backend.git" }
```

This clones them as bare repos and sets up the worktree structure. Your code lives in `repos/myapp/worktrees/main/`.

### Or Start Fresh

Create a new repo from scratch:
```
mkdir -p repos/mynewproject/worktrees/main
cd repos/mynewproject/worktrees/main
git init
# ... create your project
```

Then push to GitHub and use `git_init_repo` to set up the bare repo structure.

## How It Works

### The Enforced Workflow

Claude **cannot edit files** in `repos/` without:
1. An active task (in-progress status)
2. That task linked to a requirement

This is enforced via hooks. Here's the required flow:

```
1. Create requirement  → req_create { type: "feature", title: "..." }
2. Create task         → task_create { title: "...", priority: "P1" }
3. Link them           → req_link_task { reqId: "FEAT-001", taskId: "TASK-001" }
4. Start task          → task_start { taskId: "TASK-001" }
5. Create worktree     → git_create_worktree { repo: "myapp", branch: "feature/x" }
6. NOW you can code    → Edit files in repos/myapp/worktrees/feature-x/
```

### Prompt Patterns

**For planning:**
```
I need to refactor the payment system. Don't write code yet.
Create a PRD requirement, break it into tasks, and show me the plan.
```

**For implementation:**
```
Start TASK-003. The worktree is at repos/myapp/worktrees/feature-payments/
Implement the Stripe webhook handler in src/payments/webhook.ts
```

**For review:**
```
Review the changes in repos/myapp/worktrees/feature-payments/
Run through the code-reviewer agent checklist, then security-auditor.
```

**For PR:**
```
Create a PR for feature-payments worktree.
Use github_create_pr and include the acceptance criteria from TASK-003.
```

## MCP Tools (47 total)

### Git & Worktrees
| Tool | Description |
|------|-------------|
| `git_init_repo` | Initialize a repo: `{ name, url }` |
| `git_list_repos` | List all initialized repositories |
| `git_create_worktree` | Create worktree: `{ repo, branch }` |
| `git_list_worktrees` | List worktrees (optionally filter by repo) |
| `git_remove_worktree` | Remove: `{ repo, directory, force? }` |
| `git_sync` | Sync: `{ repo: "all" }` or specific repo |
| `git_worktree_status` | Get status: `{ repo, directory }` |
| `git_commit` | Commit: `{ repo, directory, message }` |
| `git_push` | Push: `{ repo, directory, setUpstream? }` |
| `git_pull` | Pull: `{ repo, directory, rebase? }` |
| `git_reset` | Reset to remote: `{ repo, directory, hard? }` |

### GitHub
| Tool | Description |
|------|-------------|
| `github_create_pr` | Create PR from worktree |
| `github_list_prs` | List PRs: `{ repo, state? }` |
| `github_get_pr` | Get PR details: `{ repo, number }` |
| `github_merge_pr` | Merge: `{ repo, number, method? }` |
| `github_pr_checks` | Get CI status: `{ repo, number }` |
| `github_close_pr` | Close without merging |
| `github_list_branches` | List branches |
| `github_create_issue` | Create issue |
| `github_list_issues` | List issues |
| `github_add_comment` | Comment on PR/issue |
| `github_repo_info` | Get repo info |

### Tasks
| Tool | Description |
|------|-------------|
| `task_create` | Create: `{ title, description, priority?, repos? }` |
| `task_list` | List: `{ status?, priority?, labels? }` |
| `task_get` | Get details: `{ taskId }` |
| `task_update` | Update fields |
| `task_start` | Move to in-progress |
| `task_complete` | Mark as done |
| `task_block` | Mark as blocked: `{ taskId, blockedBy }` |
| `task_unblock` | Unblock |
| `task_add_note` | Add implementation note |
| `task_check_criterion` | Check acceptance criterion |
| `task_current` | Get in-progress tasks |
| `task_stats` | Get statistics |
| `task_link_worktree` | Link task to worktree |
| `task_archive` | Archive old completed tasks |

### Requirements
| Tool | Description |
|------|-------------|
| `req_create` | Create: `{ type, title, description? }` |
| `req_list` | List: `{ type?, status? }` |
| `req_get` | Get details: `{ reqId }` |
| `req_update_status` | Update status |
| `req_link_task` | Link to task |
| `req_link_requirement` | Link requirements together |
| `req_add_question` | Add open question |
| `req_add_criterion` | Add acceptance criterion |
| `req_generate_spec` | Generate tech-spec from PRD |
| `req_traceability` | Get traceability matrix |

## Hooks System

Hooks run at specific points to enforce workflow:

### Session Start
Shows pending tasks when Claude starts:
```
📋 PENDING WORK:
• 2 task(s) in progress
• 5 task(s) in backlog
```

### Requirement Enforcement (PreToolUse on Edit|Write)
Blocks edits to `repos/` without an active, linked task:
```
🚫 WORKFLOW REQUIRED: No active task found.

1. req_create { type: "feature", ... }
2. task_create { ... }
3. req_link_task { ... }
4. task_start { ... }

Then you can make changes.
```

### Task Completion Gate (Stop)
Warns when trying to end session with pending work:
```
🚫 WORK REMAINING:
• 2 task(s) in-progress
• 3 task(s) in backlog

Consider completing these before stopping.
```

### Dangerous Command Blocker (PreToolUse on Bash)
Blocks risky commands like `rm -rf /`, `chmod -R 777`, etc.

### Hook Configuration

Located in `.claude/settings.json`:
```json
{
  "hooks": {
    "SessionStart": [{ "hooks": [{ "command": "node .claude/hooks/session-task-reminder.js" }] }],
    "PreToolUse": [
      { "matcher": "Bash", "hooks": [{ "command": "node .claude/hooks/dangerous-command-blocker.js" }] },
      { "matcher": "Edit|Write", "hooks": [{ "command": "node .claude/hooks/requirement-enforcement.js" }] }
    ],
    "Stop": [{ "hooks": [{ "command": "node .claude/hooks/task-completion-gate.js" }] }]
  }
}
```

## Multi-Model Delegation

Claude acts as the orchestrator and can delegate to other AI models via MCP:

### Codex CLI
```
mcp__codex-cli__codex {
  prompt: "Implement the auth middleware in this worktree",
  cwd: "/path/to/repos/myapp/worktrees/feature-auth"
}
```
- Best for: Backend logic, API development, system-level code, refactoring

### Gemini CLI
```
mcp__gemini-cli__ask-gemini {
  prompt: "Review this React component for accessibility issues",
  model: "gemini-2.5-pro"
}
```
- Best for: UI design, frontend code, analysis, documentation

### Delegation Patterns

**Parallel reviews** - Run multiple models on the same code:
```
Review repos/myapp/worktrees/feature-auth/src/auth/

1. Use Gemini for UI/UX review
2. Use Codex for backend logic review
3. Use security-auditor agent for security check
```

**Specialized tasks** - Route to the right model:
```
For this feature:
- Delegate UI components to Gemini
- Delegate API handlers to Codex
- I'll orchestrate and review
```

## Agent Templates

Specialized agents in `.claude/agents/`:

| Agent | Purpose |
|-------|---------|
| `code-reviewer.md` | Quality-focused code reviews |
| `test-writer.md` | Generate comprehensive test suites |
| `doc-generator.md` | API and code documentation |
| `security-auditor.md` | Vulnerability detection, OWASP checks |
| `architecture-planner.md` | System design and planning |
| `pr-manager.md` | PR lifecycle management |
| `qa-tester.md` | Functional testing and bug reports |

Use them:
```
Read .claude/agents/security-auditor.md and run that review
on repos/myapp/worktrees/feature-auth/src/auth/
```

## Directory Structure

```
my-project/
├── repos/                    # All repositories
│   └── myapp/
│       ├── .bare/            # Bare git repo
│       └── worktrees/
│           ├── main/
│           └── feature-auth/
├── tasks/                    # Task management
│   ├── backlog/
│   ├── in-progress/
│   ├── completed/
│   ├── blocked/
│   └── archive/
├── requirements/             # Requirements management
│   ├── draft/
│   ├── review/
│   ├── approved/
│   ├── implemented/
│   └── deprecated/
├── mcp/                      # MCP server (47 tools)
│   ├── server.js
│   └── modules/
│       ├── git.js            # Git/worktree tools
│       ├── github.js         # GitHub tools
│       ├── tasks.js          # Task management
│       ├── requirements.js   # Requirements management
│       └── index.js
├── .claude/
│   ├── agents/               # Agent templates
│   │   ├── code-reviewer.md
│   │   ├── security-auditor.md
│   │   └── ...
│   ├── hooks/                # Workflow enforcement
│   │   ├── requirement-enforcement.js
│   │   ├── task-completion-gate.js
│   │   └── ...
│   └── settings.json
├── .mcp.json
├── CLAUDE.md
└── package.json
```

## Real Workflow Example

```
Me: I need to add rate limiting to the API

Claude: [Asks clarifying questions]
- Which endpoints? All or specific ones?
- What limits? Per user, per IP, global?
- What happens when limit hit?

Me: All authenticated endpoints, 100 req/min per user, 429 response

Claude:
- Creates FEAT-012: API Rate Limiting
- Creates TASK-031: Implement rate limit middleware
- Creates TASK-032: Add Redis backend
- Creates TASK-033: Add rate limit headers
- Links all to FEAT-012
- Creates worktree: feature/rate-limiting
- Starts TASK-031
- Implements...

Me: [tries to end session early]

Claude: [hook fires]
🚫 WORK REMAINING:
• 2 task(s) in-progress

[Continues until done]
```

## Extending

Add custom MCP tools:

```javascript
// mcp/modules/mytools.js
export const myModule = {
  name: "mytools",
  tools: [{
    name: "my_tool",
    description: "Does something",
    inputSchema: { type: "object", properties: { ... } },
    handler: async (args) => { return { result: "..." }; }
  }]
};
```

Register in `mcp/modules/index.js`:
```javascript
export { myModule } from "./mytools.js";
```

## Prerequisites

- Node.js 18+
- [Claude Code](https://claude.ai/download)
- Git 2.5+ (for worktree support)
- GitHub CLI (`gh`) for GitHub tools

## License

MIT
