#!/usr/bin/env node
import * as path from 'path';
import * as fs from 'fs';
import { readInput, context, block, TASKS_DIR, REQUIREMENTS_DIR, findFiles, readFileContent } from './utils.js';

function getActiveTask() {
  const inProgressDir = path.join(TASKS_DIR, 'in-progress');
  const taskFiles = findFiles(inProgressDir, '^TASK-.*\\.md$');

  if (taskFiles.length === 0) return null;

  const taskFile = taskFiles[0];
  const content = readFileContent(path.join(inProgressDir, taskFile));
  const taskId = taskFile.split('-').slice(0, 2).join('-');

  // Parse repos from task
  const reposMatch = content.match(/\*\*Repos\*\*: (.+)/);
  const repos = reposMatch ? reposMatch[1].split(',').map(r => r.trim()) : [];

  return { taskId, content, file: taskFile, repos };
}

function getLinkedRequirement(taskContent) {
  const reqPatterns = ['PRD-\\d+', 'SPEC-\\d+', 'US-\\d+', 'EPIC-\\d+', 'FEAT-\\d+'];

  for (const pattern of reqPatterns) {
    const match = taskContent.match(new RegExp(pattern));
    if (match) return match[0];
  }

  return null;
}

function findRequirementForTask(taskId) {
  const statusDirs = ['draft', 'review', 'approved', 'implemented'];

  for (const dir of statusDirs) {
    const dirPath = path.join(REQUIREMENTS_DIR, dir);
    const files = findFiles(dirPath, '^(PRD|SPEC|US|EPIC|FEAT)-.*\\.md$');

    for (const file of files) {
      const content = readFileContent(path.join(dirPath, file));
      if (content.includes(taskId)) {
        const reqId = file.match(/^([A-Z]+-\d+)/)?.[1];
        // Also get repos from requirement
        const reposMatch = content.match(/\*\*Repos\*\*: (.+)/);
        const repos = reposMatch ? reposMatch[1].split(',').map(r => r.trim()) : [];
        return { reqId, repos };
      }
    }
  }

  return null;
}

function extractRepoFromPath(filePath) {
  // Extract repo name from path like /path/to/repos/myapp/worktrees/...
  const match = filePath.match(/\/repos\/([^/]+)\//);
  return match ? match[1] : null;
}

async function main() {
  const input = await readInput();
  const toolName = input.tool_name || '';
  const filePath = input.tool_input?.file_path || '';

  // Check for repo creation
  if (/mcp__worktree__git_init_repo/.test(toolName)) {
    const repoName = input.tool_input?.name || '';
    const activeTask = getActiveTask();

    if (!activeTask) {
      context(`🚫 WORKFLOW REQUIRED: Creating repo "${repoName}" requires a requirement and task.\n\nWorkflow:\n1. req_create { type: "feature", title: "...", repos: ["${repoName}"] }\n2. task_create { title: "...", description: "...", repos: ["${repoName}"] }\n3. req_link_task { reqId: "...", taskId: "..." }\n4. task_start { taskId: "..." }\n5. Then create the repo`);
      return;
    }

    // Check if repo is in task's repos list
    if (activeTask.repos.length > 0 && !activeTask.repos.includes(repoName)) {
      context(`⚠️ REPO MISMATCH: Task ${activeTask.taskId} is for repos [${activeTask.repos.join(', ')}], but creating "${repoName}".\nConsider updating the task: task_update { taskId: "${activeTask.taskId}", repos: [..., "${repoName}"] }`);
      return;
    }

    process.exit(0);
  }

  // Only check for Edit/Write operations in repos directory
  if (!/^(Edit|Write)$/.test(toolName)) {
    process.exit(0);
  }

  // Check if editing a file in repos/
  if (!filePath.includes('/repos/')) {
    process.exit(0);
  }

  const currentRepo = extractRepoFromPath(filePath);

  // Get the active task
  const activeTask = getActiveTask();

  if (!activeTask) {
    context(`🚫 WORKFLOW REQUIRED: No active task found. All repo changes must be tied to a requirement AND task.\n\nWorkflow:\n1. req_create { type: "feature", title: "..."${currentRepo ? `, repos: ["${currentRepo}"]` : ''} }\n2. task_create { title: "...", description: "..."${currentRepo ? `, repos: ["${currentRepo}"]` : ''} }\n3. req_link_task { reqId: "...", taskId: "..." }\n4. task_start { taskId: "..." }\n\nThen you can make changes.`);
    return;
  }

  // Check if task is linked to a requirement
  let linkedReq = getLinkedRequirement(activeTask.content);
  let reqRepos = [];

  if (!linkedReq) {
    const reqInfo = findRequirementForTask(activeTask.taskId);
    if (reqInfo) {
      linkedReq = reqInfo.reqId;
      reqRepos = reqInfo.repos;
    }
  }

  if (!linkedReq) {
    context(`⚠️ REQUIREMENT MISSING: Task ${activeTask.taskId} is not linked to any requirement.\nPlease link it: req_link_task { reqId: "PRD-XXX", taskId: "${activeTask.taskId}" }\nOr create a requirement first: req_create { type: "feature", title: "..."${currentRepo ? `, repos: ["${currentRepo}"]` : ''} }`);
    return;
  }

  // Check if current repo matches task/requirement repos
  if (currentRepo && activeTask.repos.length > 0 && !activeTask.repos.includes(currentRepo)) {
    context(`⚠️ REPO MISMATCH: Task ${activeTask.taskId} is for repos [${activeTask.repos.join(', ')}], but editing "${currentRepo}".\nUpdate task: task_update { taskId: "${activeTask.taskId}", repos: [..., "${currentRepo}"] }`);
    return;
  }

  // All good - task is active, linked to requirement, and repo matches
  process.exit(0);
}

main().catch(() => process.exit(0));
