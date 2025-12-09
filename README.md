# Worktree Manager

A template for AI-powered parallel development using git worktrees. Clone any repo, work on multiple features simultaneously with Claude, Codex, and Gemini.

## Why?

Git worktrees let you have multiple branches checked out at once. Combined with AI agents, you can:

- **Parallelize work**: Multiple agents working on different features simultaneously
- **Isolate changes**: Each feature in its own directory, no conflicts
- **Coordinate easily**: Claude orchestrates, delegates to Codex/Gemini as needed

## Quick Start

```bash
# 1. Clone this template
git clone https://github.com/audiogenius/worktree-manager.git
cd worktree-manager

# 2. Initialize with your target repo
./scripts/init-repo.sh https://github.com/your-org/your-repo.git

# 3. Start Claude Code
claude

# 4. Ask Claude to create worktrees and work on features
```

## How It Works

1. **You work from the root** - never `cd` into worktrees manually
2. **Claude manages worktrees** - creates them for each feature/fix
3. **Claude delegates** - can assign tasks to Codex or Gemini via MCP
4. **Each agent gets isolation** - works in their own worktree, no conflicts

## Example Session

```
You: I need to add user authentication and also fix the login bug

Claude: I'll create two worktrees and work on these in parallel.

        Creating worktree for feature/auth...
        Creating worktree for fix/login-bug...

        I'll work on the auth feature. Delegating the login bug fix to Codex.

        [Works on auth in worktrees/feature-auth/]
        [Codex works on bug in worktrees/fix-login-bug/]
```

## Scripts

| Script | Description |
|--------|-------------|
| `./scripts/init-repo.sh <url>` | Initialize with a git repo |
| `./scripts/create-worktree.sh <branch>` | Create a new worktree |
| `./scripts/list-worktrees.sh` | List all worktrees |
| `./scripts/remove-worktree.sh <name>` | Remove a worktree |
| `./scripts/sync-worktrees.sh` | Fetch latest from remote |

## Structure

```
worktree-manager/
├── .bare-repo/           # Bare git repo (created after init)
├── worktrees/            # All worktrees live here
│   ├── feature-auth/
│   ├── fix-login-bug/
│   └── ...
├── scripts/              # Worktree management
├── .claude/              # Claude Code config
│   ├── settings.json     # Permissions
│   └── agents/           # Agent prompts
├── .mcp.json             # MCP servers (Codex, Gemini)
├── CLAUDE.md             # Orchestration instructions
└── README.md
```

## Agent Configuration

### Claude Code (Orchestrator)
- Reads `CLAUDE.md` for orchestration instructions
- Has MCP access to Codex and Gemini
- Manages worktrees and delegates tasks

### Codex CLI (via MCP)
- Connected as `mcp__codex-cli__codex`
- Best for: code generation, refactoring

### Gemini CLI (via MCP)
- Connected as `mcp__gemini-cli__ask-gemini`
- Best for: analysis, documentation

## Prerequisites

- [Claude Code](https://claude.ai/download) installed
- [Codex CLI](https://github.com/openai/codex) installed (for delegation)
- Git 2.5+ (for worktree support)

## Customization

Edit these files to customize behavior:

- `CLAUDE.md` - Main orchestration instructions
- `.claude/settings.json` - Permissions and MCP servers
- `.claude/agents/*.md` - Specialized agent prompts
- `.mcp.json` - Add more MCP servers

## License

MIT
