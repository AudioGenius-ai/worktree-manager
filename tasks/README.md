# Task Management

This directory contains all tasks managed by the worktree-manager MCP server.

## Directory Structure

```
tasks/
├── backlog/          # Tasks not yet started
├── in-progress/      # Currently active tasks
├── completed/        # Finished tasks
├── blocked/          # Tasks waiting on something
├── archive/          # Old completed tasks
└── README.md
```

## MCP Tools

The task manager provides these tools via `mcp__worktree__task_*`:

- `task_list` - List tasks with filtering (status, priority, labels, search)
- `task_get` - Get full task details
- `task_create` - Create a new task
- `task_update` - Update task fields
- `task_start` - Move task to in-progress
- `task_complete` - Mark task as completed
- `task_block` - Mark task as blocked
- `task_unblock` - Move blocked task to backlog
- `task_add_note` - Add implementation note
- `task_check_criterion` - Check off acceptance criteria
- `task_current` - Get current in-progress task(s)
- `task_stats` - Get task statistics
- `task_link_worktree` - Link task to a worktree
- `task_archive` - Archive completed tasks

## Workflow

1. **Create task**: `task_create { title: "...", description: "...", priority: "P1" }`
2. **Start work**: `task_start { taskId: "TASK-001" }`
3. **Track progress**: `task_add_note { taskId: "TASK-001", note: "..." }`
4. **Complete**: `task_complete { taskId: "TASK-001" }`

## Task File Format

Tasks are stored as Markdown files with this structure:

```markdown
# TASK-001: Title

## Metadata
- **Status**: backlog
- **Priority**: P1
- **Created**: 2024-01-01
- **Updated**: 2024-01-02
- **Labels**: backend, api
- **Worktree**: myapp/feature-auth

## Description
Task description here.

## Acceptance Criteria
- [ ] Criterion 1
- [x] Criterion 2 (completed)

## Implementation Notes
- 2024-01-02: Started implementation

## Files Changed
- `src/auth.ts` - Added auth handler
```

## Priority Levels

- **P0**: Critical - Must be done immediately
- **P1**: High - Important for current sprint
- **P2**: Medium - Standard priority (default)
- **P3**: Low - Nice to have
