# Worktree Manager

A template for AI-powered parallel development using git worktrees. Work on multiple features simultaneously with Claude, Codex, and Gemini - each in isolated worktrees.

## Why?

Git worktrees let you have multiple branches checked out at once. Combined with AI agents, you can:

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

# 4. Initialize with your target repo (Claude will use MCP tools)
# > Initialize this with https://github.com/your-org/your-repo.git
```

## How It Works

1. **You work from the root** - Claude manages everything
2. **MCP tools handle git** - worktree creation, commits, pushes
3. **Claude delegates** - assigns tasks to Codex or Gemini via MCP
4. **Each agent gets isolation** - works in their own worktree

## MCP Tools

The built-in MCP server provides git worktree management:

| Tool | Description |
|------|-------------|
| `git_init_repo` | Initialize with a git repository URL |
| `git_create_worktree` | Create a new worktree for a branch |
| `git_list_worktrees` | List all active worktrees |
| `git_remove_worktree` | Remove a worktree |
| `git_sync` | Fetch latest from remote |
| `git_worktree_status` | Get status of a worktree |
| `git_commit` | Commit changes in a worktree |
| `git_push` | Push a worktree's branch |

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
You: Add user authentication and fix the login styling

Claude: I'll create two worktrees and parallelize this work.

        [Uses git_create_worktree for feature/auth]
        [Uses git_create_worktree for fix/login-styling]

        I'll handle the auth backend. Delegating the styling to Gemini
        since it's better for UI work.

        [Works on auth in worktrees/feature-auth/]
        [Gemini works on styling in worktrees/fix-login-styling/]

        Both tasks complete. Here's a summary...
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
        // Your logic here
        return { result: input.toUpperCase() };
      }
    }
  ]
};
```

Then register it:

```javascript
// mcp/modules/index.js
export { gitModule } from "./git.js";
export { myModule } from "./mytools.js";  // Add this
```

See `mcp/modules/_template.js` for a complete template with documentation.

## Structure

```
worktree-manager/
├── .bare-repo/           # Bare git repo (created after init)
├── worktrees/            # All worktrees live here
├── mcp/                  # MCP server
│   ├── server.js         # Main entry point
│   └── modules/          # Modular tools
│       ├── git.js        # Git worktree tools
│       ├── _template.js  # Template for new modules
│       └── index.js      # Module exports
├── scripts/              # Shell script alternatives
├── .claude/              # Claude Code config
│   ├── settings.json     # Permissions
│   └── agents/           # Agent prompts
├── .mcp.json             # MCP server definitions
├── CLAUDE.md             # Orchestration instructions
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
