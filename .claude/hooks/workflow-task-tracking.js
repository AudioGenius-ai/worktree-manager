#!/usr/bin/env node
import * as path from 'path';
import { readInput, context, TASKS_DIR, findFiles, countFiles } from './utils.js';

async function main() {
  const input = await readInput();
  const toolName = input.tool_name || '';
  const inProgressDir = path.join(TASKS_DIR, 'in-progress');

  // When creating worktree, check if it follows task naming
  if (/mcp__worktree__git_create_worktree/.test(toolName)) {
    const branch = input.tool_input?.branch || '';
    const taskMatch = branch.match(/TASK-\d+/i);

    if (taskMatch) {
      const taskId = taskMatch[0].toUpperCase();
      const taskFiles = findFiles(inProgressDir, `^${taskId}.*\\.md$`);

      if (taskFiles.length === 0) {
        context(`💡 WORKFLOW: Creating worktree for ${taskId}. Consider: task_start { taskId: '${taskId}' }`);
        return;
      }
    }
  }

  // When editing files in repos, remind about task tracking
  if (/^(Edit|Write)$/.test(toolName)) {
    const filePath = input.tool_input?.file_path || '';

    if (/\/repos\/[^/]+\/worktrees\//.test(filePath)) {
      const inProgressCount = countFiles(inProgressDir, '^TASK-.*\\.md$');

      if (inProgressCount > 0) {
        const taskFiles = findFiles(inProgressDir, '^TASK-.*\\.md$');
        const currentTask = taskFiles[0]?.split('-').slice(0, 2).join('-') || '';

        if (currentTask) {
          context(`📝 Track file change: task_add_note { taskId: '${currentTask}', note: 'Modified ${path.basename(filePath)}' }`);
          return;
        }
      }
    }
  }

  process.exit(0);
}

main().catch(() => process.exit(0));
