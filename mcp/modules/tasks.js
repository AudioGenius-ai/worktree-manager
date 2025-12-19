import { readdir, readFile, writeFile, mkdir, rename, unlink } from "node:fs/promises";
import { join, basename, dirname } from "node:path";
import { existsSync, readdirSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = join(__dirname, "..", "..");
const TASKS_DIR = join(ROOT_DIR, "tasks");

const STATUSES = ["backlog", "in-progress", "completed", "blocked", "archive"];
const PRIORITIES = ["P0", "P1", "P2", "P3"];

function getToday() {
  return new Date().toISOString().split("T")[0];
}

function ensureDirectoriesSync() {
  for (const dir of STATUSES) {
    const path = join(TASKS_DIR, dir);
    if (!existsSync(path)) {
      mkdirSync(path, { recursive: true });
    }
  }
}

function generateTaskId() {
  ensureDirectoriesSync();
  let maxNum = 0;

  for (const dir of STATUSES) {
    const dirPath = join(TASKS_DIR, dir);
    if (existsSync(dirPath)) {
      try {
        const files = readdirSync(dirPath);
        for (const file of files) {
          const match = file.match(/^TASK-(\d+)/);
          if (match) {
            const num = parseInt(match[1], 10);
            if (num > maxNum) maxNum = num;
          }
        }
      } catch {}
    }
  }

  return `TASK-${String(maxNum + 1).padStart(3, "0")}`;
}

function parseTaskFile(content, filename) {
  const task = {};

  const idMatch = filename.match(/^(TASK-\d+)/);
  if (idMatch) task.id = idMatch[1];

  const titleMatch = content.match(/^# (TASK-\d+): (.+)$/m);
  if (titleMatch) task.title = titleMatch[2];

  const statusMatch = content.match(/\*\*Status\*\*: (\w+(-\w+)?)/);
  if (statusMatch) task.status = statusMatch[1];

  const priorityMatch = content.match(/\*\*Priority\*\*: (P\d)/);
  if (priorityMatch) task.priority = priorityMatch[1];

  const createdMatch = content.match(/\*\*Created\*\*: ([\d-]+)/);
  if (createdMatch) task.created = createdMatch[1];

  const updatedMatch = content.match(/\*\*Updated\*\*: ([\d-]+)/);
  if (updatedMatch) task.updated = updatedMatch[1];

  const completedMatch = content.match(/\*\*Completed\*\*: ([\d-]+)/);
  if (completedMatch) task.completed = completedMatch[1];

  const blockedMatch = content.match(/\*\*Blocked By\*\*: (.+)/);
  if (blockedMatch) task.blockedBy = blockedMatch[1];

  const worktreeMatch = content.match(/\*\*Worktree\*\*: (.+)/);
  if (worktreeMatch) task.worktree = worktreeMatch[1];

  const reposMatch = content.match(/\*\*Repos\*\*: (.+)/);
  if (reposMatch) task.repos = reposMatch[1].split(",").map(r => r.trim());

  const parentMatch = content.match(/\*\*Parent\*\*: (TASK-\d+)/);
  if (parentMatch) task.parent = parentMatch[1];

  const subtasksMatch = content.match(/## Subtasks\n([\s\S]*?)(?=\n## |$)/);
  if (subtasksMatch) {
    task.subtasks = subtasksMatch[1]
      .split("\n")
      .filter(line => line.match(/^- \[[ x]\] (TASK-\d+)/))
      .map(line => {
        const match = line.match(/^- \[([x ])\] (TASK-\d+)/);
        return match ? { id: match[2], completed: match[1] === 'x' } : null;
      })
      .filter(Boolean);
  }

  const estimateMatch = content.match(/\*\*Estimate\*\*: (\d+)h/);
  if (estimateMatch) task.estimate = parseInt(estimateMatch[1]);

  const actualMatch = content.match(/\*\*Actual\*\*: (\d+)h/);
  if (actualMatch) task.actual = parseInt(actualMatch[1]);

  const labelsMatch = content.match(/\*\*Labels\*\*: (.+)/);
  if (labelsMatch) task.labels = labelsMatch[1].split(",").map(l => l.trim());

  const descMatch = content.match(/## Description\n([\s\S]*?)(?=\n## )/);
  if (descMatch) task.description = descMatch[1].trim();

  const criteriaMatch = content.match(/## Acceptance Criteria\n([\s\S]*?)(?=\n## )/);
  if (criteriaMatch) {
    task.acceptanceCriteria = criteriaMatch[1]
      .split("\n")
      .filter(line => line.match(/^- \[[ x]\]/))
      .map(line => ({
        text: line.replace(/^- \[[ x]\] /, ""),
        checked: line.includes("[x]"),
      }));
  }

  return task;
}

function generateTaskContent(task) {
  const today = getToday();
  const lines = [];

  lines.push(`# ${task.id}: ${task.title}`);
  lines.push("");
  lines.push("## Metadata");
  lines.push(`- **Status**: ${task.status || "backlog"}`);
  lines.push(`- **Priority**: ${task.priority || "P2"}`);
  lines.push(`- **Created**: ${task.created || today}`);
  lines.push(`- **Updated**: ${today}`);
  if (task.completed) lines.push(`- **Completed**: ${task.completed}`);
  if (task.blockedBy) lines.push(`- **Blocked By**: ${task.blockedBy}`);
  if (task.repos?.length) lines.push(`- **Repos**: ${task.repos.join(", ")}`);
  if (task.parent) lines.push(`- **Parent**: ${task.parent}`);
  if (task.worktree) lines.push(`- **Worktree**: ${task.worktree}`);
  if (task.estimate) lines.push(`- **Estimate**: ${task.estimate}h`);
  if (task.actual) lines.push(`- **Actual**: ${task.actual}h`);
  if (task.labels?.length) lines.push(`- **Labels**: ${task.labels.join(", ")}`);
  lines.push("");

  lines.push("## Description");
  lines.push(task.description || "_No description_");
  lines.push("");

  lines.push("## Acceptance Criteria");
  if (task.acceptanceCriteria?.length) {
    for (const criterion of task.acceptanceCriteria) {
      const check = criterion.checked ? "x" : " ";
      lines.push(`- [${check}] ${criterion.text}`);
    }
  } else {
    lines.push("- [ ] _Add criteria_");
  }
  lines.push("");

  lines.push("## Subtasks");
  if (task.subtasks?.length) {
    for (const sub of task.subtasks) {
      const check = sub.completed ? "x" : " ";
      lines.push(`- [${check}] ${sub.id}`);
    }
  } else {
    lines.push("_No subtasks_");
  }
  lines.push("");

  lines.push("## Implementation Notes");
  lines.push(task.implementationNotes || "_To be filled during implementation_");
  lines.push("");

  lines.push("## Files Changed");
  if (task.filesChanged?.length) {
    for (const file of task.filesChanged) {
      lines.push(`- \`${file.path}\` - ${file.description}`);
    }
  } else {
    lines.push("_No files changed yet_");
  }
  lines.push("");

  return lines.join("\n");
}

async function findTask(taskId) {
  ensureDirectoriesSync();

  for (const dir of STATUSES) {
    const dirPath = join(TASKS_DIR, dir);
    try {
      const files = await readdir(dirPath);
      for (const file of files) {
        if (file.startsWith(taskId) && file.endsWith(".md")) {
          const fullPath = join(dirPath, file);
          const content = await readFile(fullPath, "utf-8");
          return {
            task: parseTaskFile(content, file),
            content,
            path: join(dir, file),
            fullPath,
          };
        }
      }
    } catch {}
  }
  return null;
}

export const tasksModule = {
  name: "tasks",
  description: "Task management for tracking work items with status, priority, and worktree integration",

  tools: [
    {
      name: "task_list",
      description: "List tasks with filtering by status, priority, labels, and search",
      inputSchema: {
        type: "object",
        properties: {
          status: {
            type: "string",
            description: "Filter by status: backlog, in-progress, completed, blocked (comma-separated for multiple)",
          },
          priority: {
            type: "string",
            description: "Filter by priority: P0, P1, P2, P3 (comma-separated for multiple)",
          },
          labels: {
            type: "string",
            description: "Filter by labels (comma-separated)",
          },
          search: {
            type: "string",
            description: "Search in title, description, and ID",
          },
          worktree: {
            type: "string",
            description: "Filter by linked worktree",
          },
          limit: {
            type: "number",
            description: "Max results (default: 50)",
          },
        },
      },
      handler: async ({ status, priority, labels, search, worktree, limit = 50 }) => {
        ensureDirectoriesSync();
        const tasks = [];

        const statusFilter = status ? status.split(",").map(s => s.trim()) : STATUSES.filter(s => s !== "archive");
        const priorityFilter = priority ? priority.split(",").map(p => p.trim()) : null;
        const labelFilter = labels ? labels.split(",").map(l => l.trim().toLowerCase()) : null;

        for (const dir of statusFilter) {
          const dirPath = join(TASKS_DIR, dir);
          try {
            const files = await readdir(dirPath);
            for (const file of files) {
              if (file.endsWith(".md") && file !== "README.md") {
                const content = await readFile(join(dirPath, file), "utf-8");
                const task = parseTaskFile(content, file);

                if (priorityFilter && !priorityFilter.includes(task.priority)) continue;
                if (labelFilter && !task.labels?.some(l => labelFilter.includes(l.toLowerCase()))) continue;
                if (worktree && task.worktree !== worktree) continue;
                if (search) {
                  const searchLower = search.toLowerCase();
                  const matches =
                    task.id?.toLowerCase().includes(searchLower) ||
                    task.title?.toLowerCase().includes(searchLower) ||
                    task.description?.toLowerCase().includes(searchLower);
                  if (!matches) continue;
                }

                tasks.push({
                  id: task.id,
                  title: task.title,
                  status: dir,
                  priority: task.priority || "P2",
                  labels: task.labels || [],
                  worktree: task.worktree || null,
                  estimate: task.estimate || null,
                  created: task.created,
                  updated: task.updated,
                });
              }
            }
          } catch {}
        }

        tasks.sort((a, b) => {
          if (a.priority !== b.priority) return a.priority.localeCompare(b.priority);
          return (b.updated || "").localeCompare(a.updated || "");
        });

        return {
          tasks: tasks.slice(0, limit),
          total: tasks.length,
          showing: Math.min(tasks.length, limit),
        };
      },
    },

    {
      name: "task_get",
      description: "Get full details of a specific task",
      inputSchema: {
        type: "object",
        properties: {
          taskId: {
            type: "string",
            description: "Task ID (e.g., TASK-001)",
          },
        },
        required: ["taskId"],
      },
      handler: async ({ taskId }) => {
        const result = await findTask(taskId);
        if (!result) {
          return { error: `Task ${taskId} not found` };
        }
        return {
          ...result.task,
          path: result.path,
          rawContent: result.content,
        };
      },
    },

    {
      name: "task_create",
      description: "Create a new task",
      inputSchema: {
        type: "object",
        properties: {
          title: { type: "string", description: "Task title" },
          description: { type: "string", description: "Task description" },
          priority: { type: "string", description: "Priority: P0 (critical), P1 (high), P2 (medium), P3 (low)" },
          labels: { type: "array", items: { type: "string" }, description: "Labels for categorization" },
          acceptanceCriteria: { type: "array", items: { type: "string" }, description: "Acceptance criteria" },
          repos: { type: "array", items: { type: "string" }, description: "Repos this task affects" },
          parent: { type: "string", description: "Parent task ID (for subtasks)" },
          worktree: { type: "string", description: "Link to worktree (repo/directory format)" },
          estimate: { type: "number", description: "Estimated hours" },
        },
        required: ["title", "description"],
      },
      handler: async ({ title, description, priority, labels, acceptanceCriteria, repos, parent, worktree, estimate }) => {
        ensureDirectoriesSync();

        const id = generateTaskId();
        const task = {
          id,
          title,
          status: "backlog",
          priority: priority || "P2",
          created: getToday(),
          description,
          labels: labels || [],
          repos: repos || [],
          parent,
          acceptanceCriteria: acceptanceCriteria?.map(text => ({ text, checked: false })) || [],
          worktree,
          estimate,
        };

        // If this is a subtask, add it to parent's subtask list
        if (parent) {
          const parentResult = await findTask(parent);
          if (parentResult) {
            const today = getToday();
            let parentContent = parentResult.content;

            if (parentContent.includes("_No subtasks_")) {
              parentContent = parentContent.replace("_No subtasks_", `- [ ] ${id}`);
            } else {
              parentContent = parentContent.replace(
                /## Subtasks\n([\s\S]*?)(?=\n## )/,
                (match, existing) => `## Subtasks\n${existing.trim()}\n- [ ] ${id}\n\n`
              );
            }
            parentContent = parentContent.replace(/\*\*Updated\*\*: [\d-]+/, `**Updated**: ${today}`);
            await writeFile(parentResult.fullPath, parentContent, "utf-8");
          }
        }

        const content = generateTaskContent(task);
        const filename = `${id}-${title.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 50)}.md`;
        const filePath = join(TASKS_DIR, "backlog", filename);

        await writeFile(filePath, content, "utf-8");

        return {
          success: true,
          taskId: id,
          path: `backlog/${filename}`,
          message: `Created task: ${id} - ${title}`,
        };
      },
    },

    {
      name: "task_update",
      description: "Update task fields",
      inputSchema: {
        type: "object",
        properties: {
          taskId: { type: "string", description: "Task ID" },
          title: { type: "string", description: "New title" },
          description: { type: "string", description: "New description" },
          priority: { type: "string", description: "New priority" },
          labels: { type: "array", items: { type: "string" }, description: "New labels (replaces existing)" },
          worktree: { type: "string", description: "Link to worktree" },
          estimate: { type: "number", description: "Estimated hours" },
          actual: { type: "number", description: "Actual hours spent" },
        },
        required: ["taskId"],
      },
      handler: async ({ taskId, title, description, priority, labels, worktree, estimate, actual }) => {
        const result = await findTask(taskId);
        if (!result) return { error: `Task ${taskId} not found` };

        let content = result.content;
        const today = getToday();

        if (title) {
          content = content.replace(/^# (TASK-\d+): .+$/m, `# ${taskId}: ${title}`);
        }
        if (priority) {
          content = content.replace(/\*\*Priority\*\*: P\d/, `**Priority**: ${priority}`);
        }
        if (description) {
          content = content.replace(
            /## Description\n[\s\S]*?(?=\n## Acceptance)/,
            `## Description\n${description}\n\n`
          );
        }
        if (labels) {
          if (content.includes("**Labels**:")) {
            content = content.replace(/\*\*Labels\*\*: .+/, `**Labels**: ${labels.join(", ")}`);
          } else {
            content = content.replace(/(\*\*Updated\*\*: [\d-]+)/, `$1\n- **Labels**: ${labels.join(", ")}`);
          }
        }
        if (worktree) {
          if (content.includes("**Worktree**:")) {
            content = content.replace(/\*\*Worktree\*\*: .+/, `**Worktree**: ${worktree}`);
          } else {
            content = content.replace(/(\*\*Updated\*\*: [\d-]+)/, `$1\n- **Worktree**: ${worktree}`);
          }
        }
        if (estimate) {
          if (content.includes("**Estimate**:")) {
            content = content.replace(/\*\*Estimate\*\*: \d+h/, `**Estimate**: ${estimate}h`);
          } else {
            content = content.replace(/(\*\*Updated\*\*: [\d-]+)/, `$1\n- **Estimate**: ${estimate}h`);
          }
        }
        if (actual) {
          if (content.includes("**Actual**:")) {
            content = content.replace(/\*\*Actual\*\*: \d+h/, `**Actual**: ${actual}h`);
          } else {
            content = content.replace(/(\*\*Updated\*\*: [\d-]+)/, `$1\n- **Actual**: ${actual}h`);
          }
        }

        content = content.replace(/\*\*Updated\*\*: [\d-]+/, `**Updated**: ${today}`);
        await writeFile(result.fullPath, content, "utf-8");

        return { success: true, message: `Updated task: ${taskId}` };
      },
    },

    {
      name: "task_start",
      description: "Move a task to in-progress",
      inputSchema: {
        type: "object",
        properties: {
          taskId: { type: "string", description: "Task ID" },
        },
        required: ["taskId"],
      },
      handler: async ({ taskId }) => {
        const result = await findTask(taskId);
        if (!result) return { error: `Task ${taskId} not found` };

        const currentDir = result.path.split("/")[0];
        if (currentDir === "in-progress") {
          return { success: true, message: `Task ${taskId} is already in progress` };
        }

        const today = getToday();
        const newContent = result.content
          .replace(/\*\*Status\*\*: \w+(-\w+)?/, "**Status**: in-progress")
          .replace(/\*\*Updated\*\*: [\d-]+/, `**Updated**: ${today}`);

        const filename = basename(result.path);
        const newPath = join(TASKS_DIR, "in-progress", filename);

        await writeFile(newPath, newContent, "utf-8");
        await unlink(result.fullPath);

        return { success: true, message: `Started task: ${taskId}` };
      },
    },

    {
      name: "task_complete",
      description: "Mark a task as completed",
      inputSchema: {
        type: "object",
        properties: {
          taskId: { type: "string", description: "Task ID" },
          actual: { type: "number", description: "Actual hours spent (optional)" },
        },
        required: ["taskId"],
      },
      handler: async ({ taskId, actual }) => {
        const result = await findTask(taskId);
        if (!result) return { error: `Task ${taskId} not found` };

        const today = getToday();
        let newContent = result.content
          .replace(/\*\*Status\*\*: \w+(-\w+)?/, "**Status**: completed")
          .replace(/\*\*Updated\*\*: [\d-]+/, `**Updated**: ${today}`);

        if (!newContent.includes("**Completed**:")) {
          newContent = newContent.replace(/(\*\*Updated\*\*: [\d-]+)/, `$1\n- **Completed**: ${today}`);
        }

        if (actual) {
          if (newContent.includes("**Actual**:")) {
            newContent = newContent.replace(/\*\*Actual\*\*: \d+h/, `**Actual**: ${actual}h`);
          } else {
            newContent = newContent.replace(/(\*\*Updated\*\*: [\d-]+)/, `$1\n- **Actual**: ${actual}h`);
          }
        }

        const filename = basename(result.path);
        const newPath = join(TASKS_DIR, "completed", filename);

        await writeFile(newPath, newContent, "utf-8");
        await unlink(result.fullPath);

        return { success: true, message: `Completed task: ${taskId}` };
      },
    },

    {
      name: "task_block",
      description: "Mark a task as blocked",
      inputSchema: {
        type: "object",
        properties: {
          taskId: { type: "string", description: "Task ID" },
          blockedBy: { type: "string", description: "What is blocking this task" },
        },
        required: ["taskId", "blockedBy"],
      },
      handler: async ({ taskId, blockedBy }) => {
        const result = await findTask(taskId);
        if (!result) return { error: `Task ${taskId} not found` };

        const today = getToday();
        let newContent = result.content
          .replace(/\*\*Status\*\*: \w+(-\w+)?/, "**Status**: blocked")
          .replace(/\*\*Updated\*\*: [\d-]+/, `**Updated**: ${today}`);

        if (newContent.includes("**Blocked By**:")) {
          newContent = newContent.replace(/\*\*Blocked By\*\*: .+/, `**Blocked By**: ${blockedBy}`);
        } else {
          newContent = newContent.replace(/(\*\*Updated\*\*: [\d-]+)/, `$1\n- **Blocked By**: ${blockedBy}`);
        }

        const filename = basename(result.path);
        const newPath = join(TASKS_DIR, "blocked", filename);

        await writeFile(newPath, newContent, "utf-8");
        await unlink(result.fullPath);

        return { success: true, message: `Blocked task: ${taskId} - ${blockedBy}` };
      },
    },

    {
      name: "task_unblock",
      description: "Move a blocked task back to backlog",
      inputSchema: {
        type: "object",
        properties: {
          taskId: { type: "string", description: "Task ID" },
        },
        required: ["taskId"],
      },
      handler: async ({ taskId }) => {
        const result = await findTask(taskId);
        if (!result) return { error: `Task ${taskId} not found` };

        const today = getToday();
        let newContent = result.content
          .replace(/\*\*Status\*\*: \w+(-\w+)?/, "**Status**: backlog")
          .replace(/\*\*Updated\*\*: [\d-]+/, `**Updated**: ${today}`)
          .replace(/\n- \*\*Blocked By\*\*: .+/, "");

        const filename = basename(result.path);
        const newPath = join(TASKS_DIR, "backlog", filename);

        await writeFile(newPath, newContent, "utf-8");
        await unlink(result.fullPath);

        return { success: true, message: `Unblocked task: ${taskId}` };
      },
    },

    {
      name: "task_add_note",
      description: "Add an implementation note to a task",
      inputSchema: {
        type: "object",
        properties: {
          taskId: { type: "string", description: "Task ID" },
          note: { type: "string", description: "Note to add" },
        },
        required: ["taskId", "note"],
      },
      handler: async ({ taskId, note }) => {
        const result = await findTask(taskId);
        if (!result) return { error: `Task ${taskId} not found` };

        const today = getToday();
        let newContent = result.content.replace(
          /## Implementation Notes\n([\s\S]*?)(?=\n## Files Changed)/,
          (match, existingNotes) => {
            const trimmed = existingNotes.trim();
            if (trimmed === "_To be filled during implementation_") {
              return `## Implementation Notes\n- ${today}: ${note}\n\n`;
            }
            return `## Implementation Notes\n${trimmed}\n- ${today}: ${note}\n\n`;
          }
        ).replace(/\*\*Updated\*\*: [\d-]+/, `**Updated**: ${today}`);

        await writeFile(result.fullPath, newContent, "utf-8");
        return { success: true, message: `Added note to ${taskId}` };
      },
    },

    {
      name: "task_check_criterion",
      description: "Mark an acceptance criterion as complete",
      inputSchema: {
        type: "object",
        properties: {
          taskId: { type: "string", description: "Task ID" },
          index: { type: "number", description: "Criterion index (0-based)" },
        },
        required: ["taskId", "index"],
      },
      handler: async ({ taskId, index }) => {
        const result = await findTask(taskId);
        if (!result) return { error: `Task ${taskId} not found` };

        const today = getToday();
        let idx = 0;
        const newContent = result.content.replace(
          /- \[ \] (.+)/g,
          (match, criterion) => {
            if (idx++ === index) {
              return `- [x] ${criterion}`;
            }
            return match;
          }
        ).replace(/\*\*Updated\*\*: [\d-]+/, `**Updated**: ${today}`);

        await writeFile(result.fullPath, newContent, "utf-8");
        return { success: true, message: `Checked criterion ${index} in ${taskId}` };
      },
    },

    {
      name: "task_current",
      description: "Get the current in-progress task(s)",
      inputSchema: {
        type: "object",
        properties: {},
      },
      handler: async () => {
        ensureDirectoriesSync();
        const inProgressDir = join(TASKS_DIR, "in-progress");
        const tasks = [];

        try {
          const files = await readdir(inProgressDir);
          for (const file of files) {
            if (file.endsWith(".md") && file !== "README.md") {
              const content = await readFile(join(inProgressDir, file), "utf-8");
              const task = parseTaskFile(content, file);
              tasks.push({
                id: task.id,
                title: task.title,
                priority: task.priority,
                worktree: task.worktree,
                started: task.updated,
              });
            }
          }
        } catch {}

        if (tasks.length === 0) {
          return { message: "No tasks currently in progress", tasks: [] };
        }

        return {
          message: `${tasks.length} task(s) in progress`,
          tasks,
        };
      },
    },

    {
      name: "task_stats",
      description: "Get task statistics",
      inputSchema: {
        type: "object",
        properties: {},
      },
      handler: async () => {
        ensureDirectoriesSync();
        const stats = {
          total: 0,
          byStatus: { backlog: 0, "in-progress": 0, completed: 0, blocked: 0 },
          byPriority: { P0: 0, P1: 0, P2: 0, P3: 0 },
          byLabel: {},
          estimatedHours: 0,
          actualHours: 0,
        };

        for (const dir of ["backlog", "in-progress", "completed", "blocked"]) {
          const dirPath = join(TASKS_DIR, dir);
          try {
            const files = await readdir(dirPath);
            for (const file of files) {
              if (file.endsWith(".md") && file !== "README.md") {
                stats.total++;
                stats.byStatus[dir]++;

                const content = await readFile(join(dirPath, file), "utf-8");
                const task = parseTaskFile(content, file);

                if (task.priority) stats.byPriority[task.priority]++;
                if (task.estimate) stats.estimatedHours += task.estimate;
                if (task.actual) stats.actualHours += task.actual;
                if (task.labels) {
                  for (const label of task.labels) {
                    stats.byLabel[label] = (stats.byLabel[label] || 0) + 1;
                  }
                }
              }
            }
          } catch {}
        }

        return stats;
      },
    },

    {
      name: "task_link_worktree",
      description: "Link a task to a worktree for tracking",
      inputSchema: {
        type: "object",
        properties: {
          taskId: { type: "string", description: "Task ID" },
          repo: { type: "string", description: "Repository name" },
          directory: { type: "string", description: "Worktree directory" },
        },
        required: ["taskId", "repo", "directory"],
      },
      handler: async ({ taskId, repo, directory }) => {
        const result = await findTask(taskId);
        if (!result) return { error: `Task ${taskId} not found` };

        const worktree = `${repo}/${directory}`;
        const today = getToday();

        let newContent = result.content;
        if (newContent.includes("**Worktree**:")) {
          newContent = newContent.replace(/\*\*Worktree\*\*: .+/, `**Worktree**: ${worktree}`);
        } else {
          newContent = newContent.replace(/(\*\*Updated\*\*: [\d-]+)/, `$1\n- **Worktree**: ${worktree}`);
        }
        newContent = newContent.replace(/\*\*Updated\*\*: [\d-]+/, `**Updated**: ${today}`);

        await writeFile(result.fullPath, newContent, "utf-8");
        return { success: true, message: `Linked ${taskId} to worktree ${worktree}` };
      },
    },

    {
      name: "task_archive",
      description: "Archive completed tasks",
      inputSchema: {
        type: "object",
        properties: {
          taskId: { type: "string", description: "Specific task to archive (optional)" },
          daysOld: { type: "number", description: "Archive tasks completed more than N days ago (default: 30)" },
        },
      },
      handler: async ({ taskId, daysOld = 30 }) => {
        ensureDirectoriesSync();

        if (taskId) {
          const result = await findTask(taskId);
          if (!result) return { error: `Task ${taskId} not found` };
          if (!result.path.startsWith("completed")) {
            return { error: `Task ${taskId} must be completed before archiving` };
          }

          const filename = basename(result.path);
          const newPath = join(TASKS_DIR, "archive", filename);
          await writeFile(newPath, result.content, "utf-8");
          await unlink(result.fullPath);
          return { success: true, message: `Archived task: ${taskId}` };
        }

        const cutoffDate = new Date(Date.now() - daysOld * 24 * 60 * 60 * 1000)
          .toISOString().split("T")[0];

        const archived = [];
        const completedDir = join(TASKS_DIR, "completed");

        try {
          const files = await readdir(completedDir);
          for (const file of files) {
            if (file.endsWith(".md") && file !== "README.md") {
              const content = await readFile(join(completedDir, file), "utf-8");
              const task = parseTaskFile(content, file);

              if (task.completed && task.completed < cutoffDate) {
                const newPath = join(TASKS_DIR, "archive", file);
                await writeFile(newPath, content, "utf-8");
                await unlink(join(completedDir, file));
                archived.push(task.id);
              }
            }
          }
        } catch {}

        return {
          success: true,
          archived,
          count: archived.length,
          message: archived.length > 0
            ? `Archived ${archived.length} tasks`
            : "No tasks to archive",
        };
      },
    },
  ],
};
