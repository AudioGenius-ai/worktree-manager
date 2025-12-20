# I built a Claude Code orchestration system with MCP - full workflow automation with git worktrees, task tracking, and agent delegation

My project got too big for a single Claude Code session. Context would fill up, I'd lose track of what was being worked on, and there was no structure to the chaos. So I built a system on top of Claude Code using MCP.

You know Gemini's Conductor that just came out? Think of this as that concept, but built on Claude Code with full workflow enforcement.

## What it is

An MCP server (47 tools) that gives Claude:
- Git worktree management (parallel feature development)
- Task & requirements tracking (enforced traceability)
- GitHub integration (PRs, issues, branches)
- Multi-model delegation (Codex, Gemini via MCP)
- Agent templates for specialized tasks
- Hooks that enforce workflow

## Setup

```bash
git clone https://github.com/AudioGenius-ai/worktree-manager.git my-project
cd my-project
npm install
claude
```

### Add Your Existing Projects

Bring in repos you're already working on:
```
git_init_repo { name: "myapp", url: "https://github.com/you/myapp.git" }
git_init_repo { name: "backend", url: "https://github.com/you/backend.git" }
```

This clones them as bare repos and sets up the worktree structure. Your code lives in `repos/myapp/worktrees/main/`.

### Or Start Fresh

Create new projects directly in the `repos/` directory and push to GitHub.

## How I Actually Use It

Instead of "build me X", I now work in structured prompts:

**Starting a new feature:**
```
I want to add user authentication with JWT tokens to myapp.

Initialize the repo first:
git_init_repo { name: "myapp", url: "https://github.com/org/myapp.git" }
```

Claude will:
1. Ask clarifying questions (enforced in CLAUDE.md)
2. Create a requirement: `req_create { type: "feature", title: "..." }`
3. Create tasks: `task_create { title: "...", priority: "P1" }`
4. Link them: `req_link_task { reqId: "FEAT-001", taskId: "TASK-001" }`
5. Create worktree: `git_create_worktree { repo: "myapp", branch: "feature/auth" }`
6. Start work: `task_start { taskId: "TASK-001" }`

**The hook system blocks Claude from editing files in repos/ without an active task.** This forces structure.

## Prompt Patterns I Use

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

## The MCP Tools

```
# Repos & Worktrees
git_init_repo, git_create_worktree, git_list_worktrees
git_commit, git_push, git_pull, git_reset, git_sync

# GitHub
github_create_pr, github_list_prs, github_merge_pr
github_pr_checks, github_create_issue, github_add_comment

# Tasks
task_create, task_start, task_complete, task_block
task_add_note, task_link_worktree, task_current

# Requirements
req_create, req_link_task, req_add_question
req_generate_spec, req_traceability
```

---

## Multi-Model Delegation

Claude acts as the orchestrator and can delegate to Codex and Gemini via MCP:

**Codex CLI** (backend, APIs, system code):
```
mcp__codex-cli__codex {
  prompt: "Implement the rate limiting middleware",
  cwd: "/path/to/repos/myapp/worktrees/feature-ratelimit"
}
```

**Gemini CLI** (UI, frontend, documentation):
```
mcp__gemini-cli__ask-gemini {
  prompt: "Review this React component for accessibility",
  model: "gemini-2.5-pro"
}
```

**Example delegation prompt:**
```
For this feature:
- Delegate the API endpoints to Codex
- Delegate the React components to Gemini
- I'll orchestrate and review the integration
```

This lets you run multiple AI models in parallel on different parts of your codebase.

---

## Hooks - The Secret Sauce

Claude Code has a hooks system that lets you run scripts at different points in the conversation. I use this to enforce workflow rules. Here's how each one works:

**Hook Events Available:**
- `SessionStart` - Runs when Claude starts a new session
- `PreToolUse` - Runs BEFORE a tool executes (can block it)
- `PostToolUse` - Runs AFTER a tool executes
- `Stop` / `SubagentStop` - Runs when Claude tries to end the conversation

### 1. Session Task Reminder (`SessionStart`)

When Claude starts, it immediately sees what work is pending:

```javascript
// session-task-reminder.js
const inProgressCount = countFiles(inProgressDir, '^TASK-.*\\.md$');
const backlogCount = countFiles(backlogDir, '^TASK-.*\\.md$');

if (inProgressCount > 0 || backlogCount > 0) {
  output({
    decision: 'approve',
    additionalContext: `📋 PENDING WORK:
• ${inProgressCount} task(s) in progress
• ${backlogCount} task(s) in backlog
Use task_current to see active tasks.`
  });
}
```

Claude sees this at the start of every session - no more "what was I working on?"

### 2. Requirement Enforcement (`PreToolUse` on Edit|Write)

This is the big one. Claude literally cannot edit files in `repos/` without:
- An active task (status: in-progress)
- That task linked to a requirement

```javascript
// requirement-enforcement.js
const activeTask = getActiveTask();  // Checks tasks/in-progress/

if (!activeTask) {
  context(`🚫 WORKFLOW REQUIRED: No active task found.

Workflow:
1. req_create { type: "feature", title: "..." }
2. task_create { title: "...", description: "..." }
3. req_link_task { reqId: "FEAT-001", taskId: "TASK-001" }
4. task_start { taskId: "TASK-001" }

Then you can make changes.`);
  return;  // Blocks the edit
}

// Check if task is linked to a requirement
const linkedReq = getLinkedRequirement(activeTask.content);
if (!linkedReq) {
  context(`⚠️ REQUIREMENT MISSING: Task ${activeTask.taskId} is not linked.
Please link it: req_link_task { reqId: "PRD-XXX", taskId: "${activeTask.taskId}" }`);
  return;
}
```

The hook also validates that you're editing the right repo:

```javascript
// If task specifies repos, enforce it
if (activeTask.repos.length > 0 && !activeTask.repos.includes(currentRepo)) {
  context(`⚠️ REPO MISMATCH: Task ${activeTask.taskId} is for repos
[${activeTask.repos.join(', ')}], but editing "${currentRepo}".`);
  return;
}
```

### 3. Task Completion Gate (`Stop` and `SubagentStop`)

Claude can't just end the conversation if there's pending work:

```javascript
// task-completion-gate.js
const backlogCount = countFiles(backlogDir, '^TASK-.*\\.md$');
const inProgressCount = countFiles(inProgressDir, '^TASK-.*\\.md$');

// Check for incomplete acceptance criteria
const completedFiles = findFiles(completedDir, '^TASK-.*\\.md$');
for (const file of completedFiles) {
  const content = readFileContent(file);
  const uncheckedCount = (content.match(/- \[ \]/g) || []).length;
  if (uncheckedCount > 0) {
    incompleteCriteria.push(`${taskId} (${uncheckedCount} unchecked)`);
  }
}

if (totalPending > 0 || incompleteCriteria.length > 0) {
  output({
    decision: 'approve',
    continue: true,  // Suggests Claude should keep working
    additionalContext: `🚫 WORK REMAINING:
• ${inProgressCount} task(s) in-progress
• ${backlogCount} task(s) in backlog
• Incomplete criteria: ${incompleteCriteria.join(', ')}

Consider completing these before stopping.`
  });
  return;
}
```

### 4. Dangerous Command Blocker (`PreToolUse` on Bash)

Blocks risky shell commands:

```javascript
// dangerous-command-blocker.js
const dangerous = [
  /rm\s+-rf\s+[\/~]/,      // rm -rf / or ~
  />\s*\/dev\/sd/,          // write to disk devices
  /mkfs\./,                 // format filesystem
  /dd\s+if=.*of=\/dev/,    // dd to devices
  /chmod\s+-R\s+777/,       // recursive 777
];

for (const pattern of dangerous) {
  if (pattern.test(command)) {
    block(`🚫 BLOCKED: Dangerous command detected`);
    return;
  }
}
```

### Hook Configuration in settings.json

```json
{
  "hooks": {
    "SessionStart": [{
      "hooks": [{
        "type": "command",
        "command": "node .claude/hooks/session-task-reminder.js"
      }]
    }],
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [{
          "type": "command",
          "command": "node .claude/hooks/dangerous-command-blocker.js"
        }]
      },
      {
        "matcher": "Edit|Write",
        "hooks": [{
          "type": "command",
          "command": "node .claude/hooks/requirement-enforcement.js"
        }]
      }
    ],
    "Stop": [{
      "hooks": [{
        "type": "command",
        "command": "node .claude/hooks/task-completion-gate.js"
      }]
    }]
  }
}
```

The `matcher` field uses regex - so `Edit|Write` matches both tools.

---

## Directory Structure

```
my-project/
├── repos/
│   └── myapp/
│       ├── .bare/           # Bare git repo
│       └── worktrees/
│           ├── main/
│           └── feature-auth/
├── tasks/
│   ├── backlog/
│   ├── in-progress/
│   └── completed/
├── requirements/
│   ├── draft/
│   └── approved/
├── mcp/
│   └── modules/
│       ├── git.js
│       ├── github.js
│       ├── tasks.js
│       └── requirements.js
└── .claude/
    ├── agents/          # Agent templates
    └── hooks/           # Workflow enforcement
```

## Agent Templates

In `.claude/agents/` I have markdown templates for specialized tasks:

```
code-reviewer.md        - Quality checklist, output format
security-auditor.md     - OWASP checks, severity levels
test-writer.md          - AAA pattern, coverage guidance
architecture-planner.md - System design template
pr-manager.md           - PR lifecycle management
```

Prompt to use them:
```
Read .claude/agents/security-auditor.md and run that review
on repos/myapp/worktrees/feature-auth/src/auth/
```

## Real Workflow Example

```
Me: I need to add rate limiting to the API

Claude: [Asks clarifying questions - enforced in CLAUDE.md]
- Which endpoints? All or specific ones?
- What limits? Per user, per IP, global?
- What happens when limit hit? 429 with retry-after?

Me: All authenticated endpoints, 100 req/min per user, 429 with retry header

Claude:
- Creates FEAT-012: API Rate Limiting
- Creates TASK-031: Implement rate limit middleware
- Creates TASK-032: Add Redis backend for counters
- Creates TASK-033: Add rate limit headers to responses
- Links all to FEAT-012
- Creates worktree: feature/rate-limiting
- Starts TASK-031

[Implements, commits, creates PR, links to tasks]

Me: [tries to end session]

Claude: [hook fires]
🚫 WORK REMAINING:
• 2 task(s) in-progress: TASK-032, TASK-033
• 1 task(s) in backlog

[Continues working until done]
```

---

**GitHub:** https://github.com/AudioGenius-ai/worktree-manager

It's a template. Clone it, add your repos, customize the hooks for your workflow.

Questions welcome.
