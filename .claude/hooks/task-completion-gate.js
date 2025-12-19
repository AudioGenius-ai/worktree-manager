#!/usr/bin/env node
import * as path from 'path';
import { readInput, output, TASKS_DIR, REQUIREMENTS_DIR, countFiles, findFiles, readFileContent } from './utils.js';

async function main() {
  const input = await readInput();

  // If stop_hook_active is true, this is a retry - allow it
  if (input.stop_hook_active) {
    output({ decision: 'approve', reason: 'Allowing stop after continuation attempt' });
    return;
  }

  const backlogDir = path.join(TASKS_DIR, 'backlog');
  const inProgressDir = path.join(TASKS_DIR, 'in-progress');
  const completedDir = path.join(TASKS_DIR, 'completed');

  const backlogCount = countFiles(backlogDir, '^TASK-.*\\.md$');
  const inProgressCount = countFiles(inProgressDir, '^TASK-.*\\.md$');
  const totalPending = backlogCount + inProgressCount;

  // Check for incomplete acceptance criteria in completed tasks
  let incompleteCriteria = [];
  const completedFiles = findFiles(completedDir, '^TASK-.*\\.md$');
  for (const file of completedFiles.slice(0, 5)) {
    const content = readFileContent(path.join(completedDir, file));
    const uncheckedCount = (content.match(/- \[ \]/g) || []).length;
    if (uncheckedCount > 0) {
      const taskId = file.split('-').slice(0, 2).join('-');
      incompleteCriteria.push(`${taskId} (${uncheckedCount} unchecked)`);
    }
  }

  // Check for draft requirements that need review
  const draftReqDir = path.join(REQUIREMENTS_DIR, 'draft');
  const draftReqCount = countFiles(draftReqDir, '^(PRD|SPEC|US|EPIC|FEAT)-.*\\.md$');

  // Build warnings
  const warnings = [];

  if (inProgressCount > 0) {
    const inProgressTasks = findFiles(inProgressDir, '^TASK-.*\\.md$')
      .map(f => f.split('-').slice(0, 2).join('-'))
      .slice(0, 3)
      .join(', ');
    warnings.push(`${inProgressCount} task(s) in-progress: ${inProgressTasks}`);
  }

  if (backlogCount > 0) {
    // Find highest priority backlog task
    let nextTask = '';
    for (const priority of ['P0', 'P1', 'P2', 'P3']) {
      if (nextTask) break;
      const backlogFiles = findFiles(backlogDir, '^TASK-.*\\.md$');
      for (const file of backlogFiles) {
        const content = readFileContent(path.join(backlogDir, file));
        if (content.includes(`**Priority**: ${priority}`)) {
          nextTask = file.split('-').slice(0, 2).join('-');
          break;
        }
      }
    }
    warnings.push(`${backlogCount} task(s) in backlog${nextTask ? ` (next: ${nextTask})` : ''}`);
  }

  if (incompleteCriteria.length > 0) {
    warnings.push(`Incomplete acceptance criteria: ${incompleteCriteria.join(', ')}`);
  }

  if (draftReqCount > 0) {
    warnings.push(`${draftReqCount} draft requirement(s) need review`);
  }

  // If there's pending work, suggest continuing
  if (totalPending > 0 || incompleteCriteria.length > 0) {
    const contextMsg = `🚫 WORK REMAINING:\n${warnings.map(w => `• ${w}`).join('\n')}\n\nConsider completing these before stopping. Use task_current to see active tasks.`;

    output({
      decision: 'approve',
      reason: `There are ${totalPending} pending tasks. You may want to continue working.`,
      continue: true,
      additionalContext: contextMsg
    });
    return;
  }

  // All clear - allow stop
  if (warnings.length > 0) {
    output({
      decision: 'approve',
      reason: 'Tasks completed. Minor items to note.',
      additionalContext: `Notes:\n${warnings.map(w => `• ${w}`).join('\n')}`
    });
    return;
  }

  output({ decision: 'approve', reason: '✓ All tasks completed!' });
}

main().catch(() => process.exit(0));
