# Worktree Manager

A template for AI-powered parallel development using git worktrees. Manage multiple repositories, work on multiple features simultaneously with Claude, Codex, and Gemini - each in isolated worktrees.

## Why?

Git worktrees let you have multiple branches checked out at once. Combined with AI agents, you can:

- **Multi-repo support**: Manage multiple repositories from one place
- **Parallelize work**: Multiple agents working on different features simultaneously
- **Isolate changes**: Each feature in its own directory, no conflicts
- **Coordinate easily**: Claude orchestrates, delegates to Codex/Gemini as needed
- **Extend easily**: Add custom MCP tools with the modular server

## Quick Start

```bash
# 1. Clone this template
git clone https://github.com/AudioGenius-ai/worktree-manager.git
cd worktree-manager

# 2. Install dependencies (for MCP server)
npm install

# 3. Start Claude Code
claude

# 4. Initialize your repos (Claude will use MCP tools)
# > Initialize myapp from https://github.com/org/myapp.git
# > Initialize template from https://github.com/org/template.git
```

## How It Works

1. **You work from the root** - Claude manages everything
2. **Multi-repo support** - Initialize and work across multiple repos
3. **MCP tools handle git** - worktree creation, commits, pushes
4. **Claude delegates** - assigns tasks to Codex or Gemini via MCP
5. **Each agent gets isolation** - works in their own worktree

## MCP Tools

The built-in MCP server provides git worktree management:

| Tool | Description |
|------|-------------|
| `git_init_repo` | Initialize a repository: `{ name, url }` |
| `git_list_repos` | List all initialized repositories |
| `git_create_worktree` | Create worktree: `{ repo, branch }` |
| `git_list_worktrees` | List worktrees (optionally filter by repo) |
| `git_remove_worktree` | Remove worktree: `{ repo, directory }` |
| `git_sync` | Sync repo(s): `{ repo: "all" }` or specific |
| `git_worktree_status` | Get status: `{ repo, directory }` |
| `git_commit` | Commit: `{ repo, directory, message }` |
| `git_push` | Push: `{ repo, directory }` |

## AI Agents

### Claude Code (Orchestrator)
- Reads `CLAUDE.md` for instructions
- Uses MCP tools for worktree management
- Delegates to other agents as needed

### Codex CLI (via MCP)
- Model: `gpt-5.1-codex-max`
- Best for: backend logic, API development, system code

### Gemini CLI (via MCP)
- Model: `gemini-3-pro-preview` (latest)
- Best for: UI design, frontend, analysis, documentation

## Example Session

```
You: Initialize the launchpad and template repos, then add auth to launchpad

Claude: I'll initialize both repos and create a worktree for the auth feature.

        [Uses git_init_repo for launchpad]
        [Uses git_init_repo for template]
        [Uses git_create_worktree { repo: "launchpad", branch: "feature/auth" }]

        Working on authentication in repos/launchpad/worktrees/feature-auth/
        ...
```

## Extending the MCP Server

Add your own tools by creating modules:

```javascript
// mcp/modules/mytools.js
export const myModule = {
  name: "mytools",
  description: "My custom tools",

  tools: [
    {
      name: "my_custom_tool",
      description: "Does something useful",
      inputSchema: {
        type: "object",
        properties: {
          input: { type: "string", description: "Input value" }
        },
        required: ["input"]
      },
      handler: async ({ input }) => {
        return { result: input.toUpperCase() };
      }
    }
  ]
};
```

Then register it in `mcp/modules/index.js`.

## Structure

```
worktree-manager/
├── repos/                    # All repositories
│   ├── myapp/
│   │   ├── .bare/           # Bare git repo
│   │   └── worktrees/
│   │       ├── main/
│   │       └── feature-auth/
│   └── template/
│       ├── .bare/
│       └── worktrees/
├── mcp/                      # MCP server
│   ├── server.js
│   └── modules/
│       ├── git.js
│       ├── _template.js
│       └── index.js
├── .claude/
│   └── settings.json
├── .mcp.json
├── CLAUDE.md
└── package.json
```

## Testing the MCP Server

```bash
# Run with MCP Inspector for debugging
npm run mcp:inspect
```

## Prerequisites

- Node.js 18+
- [Claude Code](https://claude.ai/download) installed
- [Codex CLI](https://github.com/openai/codex) (optional, for delegation)
- Git 2.5+ (for worktree support)

## License

MIT
