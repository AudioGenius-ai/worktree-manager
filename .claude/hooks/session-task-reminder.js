#!/usr/bin/env node
import * as path from 'path';
import { readInput, context, TASKS_DIR, countFiles, findFiles, readFileContent } from './utils.js';

async function main() {
  const input = await readInput();

  const backlogDir = path.join(TASKS_DIR, 'backlog');
  const inProgressDir = path.join(TASKS_DIR, 'in-progress');

  const backlogCount = countFiles(backlogDir, '^TASK-.*\\.md$');
  const inProgressCount = countFiles(inProgressDir, '^TASK-.*\\.md$');
  const total = backlogCount + inProgressCount;

  if (total === 0) {
    process.exit(0);
  }

  const inProgressFiles = findFiles(inProgressDir, '^TASK-.*\\.md$');
  const inProgressList = inProgressFiles
    .map(f => f.replace('.md', '').split('-').slice(0, 2).join('-'))
    .join(', ');

  let nextTask = '';
  for (const priority of ['P0', 'P1', 'P2', 'P3']) {
    if (nextTask) break;
    const backlogFiles = findFiles(backlogDir, '^TASK-.*\\.md$');
    for (const file of backlogFiles) {
      const content = readFileContent(path.join(backlogDir, file));
      if (content.includes(`**Priority**: ${priority}`)) {
        nextTask = file.replace('.md', '').split('-').slice(0, 2).join('-');
        break;
      }
    }
  }

  let msg = `📋 TASKS: ${total} pending (${inProgressCount} in-progress, ${backlogCount} backlog).`;
  if (inProgressList) msg += ` Active: ${inProgressList}.`;
  if (nextTask && inProgressCount === 0) msg += ` Next: ${nextTask}.`;
  msg += ' Use task_current or task_list to review.';

  context(msg);
}

main().catch(() => process.exit(0));
