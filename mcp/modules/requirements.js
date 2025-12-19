import { readdir, readFile, writeFile, mkdir, unlink } from "node:fs/promises";
import { join, basename, dirname } from "node:path";
import { existsSync, readdirSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = join(__dirname, "..", "..");
const REQUIREMENTS_DIR = join(ROOT_DIR, "requirements");

const STATUSES = ["draft", "review", "approved", "implemented", "deprecated"];
const TYPES = ["prd", "tech-spec", "user-story", "epic", "feature"];
const PRIORITIES = ["P0", "P1", "P2", "P3"];

const TYPE_PREFIXES = {
  prd: "PRD",
  "tech-spec": "SPEC",
  "user-story": "US",
  epic: "EPIC",
  feature: "FEAT",
};

const TYPE_LABELS = {
  prd: "Product Requirements Document",
  "tech-spec": "Technical Specification",
  "user-story": "User Story",
  epic: "Epic",
  feature: "Feature",
};

function getToday() {
  return new Date().toISOString().split("T")[0];
}

function ensureDirectoriesSync() {
  for (const dir of STATUSES) {
    const path = join(REQUIREMENTS_DIR, dir);
    if (!existsSync(path)) {
      mkdirSync(path, { recursive: true });
    }
  }
}

function generateRequirementId(type) {
  ensureDirectoriesSync();
  let maxNum = 0;
  const prefix = TYPE_PREFIXES[type] || "REQ";

  for (const dir of STATUSES) {
    const dirPath = join(REQUIREMENTS_DIR, dir);
    if (existsSync(dirPath)) {
      try {
        const files = readdirSync(dirPath);
        for (const file of files) {
          const match = file.match(new RegExp(`^${prefix}-(\\d+)`));
          if (match) {
            const num = parseInt(match[1], 10);
            if (num > maxNum) maxNum = num;
          }
        }
      } catch {}
    }
  }

  return `${prefix}-${String(maxNum + 1).padStart(3, "0")}`;
}

function parseRequirementFile(content, filename) {
  const req = {};

  const idMatch = filename.match(/^([A-Z]+-\d+)/);
  if (idMatch) req.id = idMatch[1];

  if (req.id?.startsWith("PRD")) req.type = "prd";
  else if (req.id?.startsWith("SPEC")) req.type = "tech-spec";
  else if (req.id?.startsWith("US")) req.type = "user-story";
  else if (req.id?.startsWith("EPIC")) req.type = "epic";
  else if (req.id?.startsWith("FEAT")) req.type = "feature";

  const titleMatch = content.match(/^# ([A-Z]+-\d+): (.+)$/m);
  if (titleMatch) req.title = titleMatch[2];

  const statusMatch = content.match(/\*\*Status\*\*: (\w+)/);
  if (statusMatch) req.status = statusMatch[1];

  const priorityMatch = content.match(/\*\*Priority\*\*: (P\d)/);
  if (priorityMatch) req.priority = priorityMatch[1];

  const createdMatch = content.match(/\*\*Created\*\*: ([\d-]+)/);
  if (createdMatch) req.created = createdMatch[1];

  const updatedMatch = content.match(/\*\*Updated\*\*: ([\d-]+)/);
  if (updatedMatch) req.updated = updatedMatch[1];

  const authorMatch = content.match(/\*\*Author\*\*: (.+)/);
  if (authorMatch) req.author = authorMatch[1];

  const reposMatch = content.match(/\*\*Repos\*\*: (.+)/);
  if (reposMatch) req.repos = reposMatch[1].split(",").map(r => r.trim());

  const descMatch = content.match(/## Description\n([\s\S]*?)(?=\n## )/);
  if (descMatch) req.description = descMatch[1].trim();

  const criteriaMatch = content.match(/## Acceptance Criteria\n([\s\S]*?)(?=\n## )/);
  if (criteriaMatch) {
    req.acceptanceCriteria = criteriaMatch[1]
      .split("\n")
      .filter(line => line.match(/^- \[[ x]\]/))
      .map(line => line.replace(/^- \[[ x]\] /, ""));
  }

  const tasksMatch = content.match(/## Linked Tasks\n([\s\S]*?)(?=\n## )/);
  if (tasksMatch) {
    req.linkedTasks = tasksMatch[1]
      .split("\n")
      .filter(line => line.match(/^- (TASK-\d+)/))
      .map(line => line.match(/TASK-\d+/)?.[0] || "");
  }

  const linkedReqMatch = content.match(/## Related Requirements\n([\s\S]*?)(?=\n## )/);
  if (linkedReqMatch) {
    req.linkedRequirements = linkedReqMatch[1]
      .split("\n")
      .filter(line => line.match(/^- ([A-Z]+-\d+)/))
      .map(line => line.match(/[A-Z]+-\d+/)?.[0] || "");
  }

  const questionsMatch = content.match(/## Open Questions\n([\s\S]*?)(?=\n## |$)/);
  if (questionsMatch) {
    req.openQuestions = questionsMatch[1]
      .split("\n")
      .filter(line => line.match(/^- \?/))
      .map(line => line.replace(/^- \? /, ""));
  }

  return req;
}

function generateRequirementContent(req) {
  const today = getToday();
  const lines = [];

  lines.push(`# ${req.id}: ${req.title}`);
  lines.push("");
  lines.push(`> **Type**: ${TYPE_LABELS[req.type] || "Requirement"}`);
  lines.push("");
  lines.push("## Metadata");
  lines.push(`- **Status**: ${req.status || "draft"}`);
  lines.push(`- **Priority**: ${req.priority || "P2"}`);
  lines.push(`- **Created**: ${req.created || today}`);
  lines.push(`- **Updated**: ${today}`);
  lines.push(`- **Author**: ${req.author || "Unknown"}`);
  if (req.repos?.length) lines.push(`- **Repos**: ${req.repos.join(", ")}`);
  lines.push("");

  lines.push("## Description");
  lines.push(req.description || "_Describe the requirement here_");
  lines.push("");

  if (req.type === "prd" || req.type === "epic") {
    lines.push("## Problem Statement");
    lines.push("_What problem does this solve?_");
    lines.push("");
    lines.push("## Goals");
    lines.push("- [ ] _Goal 1_");
    lines.push("");
    lines.push("## Non-Goals");
    lines.push("- _What is explicitly out of scope_");
    lines.push("");
  }

  if (req.type === "tech-spec") {
    lines.push("## Technical Approach");
    lines.push("_Describe the technical solution_");
    lines.push("");
    lines.push("## API Design");
    lines.push("```");
    lines.push("// Define interfaces and endpoints");
    lines.push("```");
    lines.push("");
  }

  if (req.type === "user-story") {
    lines.push("## User Story");
    lines.push("**As a** _[user type]_");
    lines.push("**I want to** _[action]_");
    lines.push("**So that** _[benefit]_");
    lines.push("");
  }

  lines.push("## Acceptance Criteria");
  if (req.acceptanceCriteria?.length) {
    for (const criterion of req.acceptanceCriteria) {
      lines.push(`- [ ] ${criterion}`);
    }
  } else {
    lines.push("- [ ] _Add acceptance criteria_");
  }
  lines.push("");

  lines.push("## Dependencies");
  if (req.dependencies?.length) {
    for (const dep of req.dependencies) {
      lines.push(`- ${dep}`);
    }
  } else {
    lines.push("_No dependencies identified_");
  }
  lines.push("");

  lines.push("## Related Requirements");
  if (req.linkedRequirements?.length) {
    for (const linked of req.linkedRequirements) {
      lines.push(`- ${linked}`);
    }
  } else {
    lines.push("_No related requirements_");
  }
  lines.push("");

  lines.push("## Linked Tasks");
  if (req.linkedTasks?.length) {
    for (const task of req.linkedTasks) {
      lines.push(`- ${task}`);
    }
  } else {
    lines.push("_No tasks linked yet_");
  }
  lines.push("");

  lines.push("## Open Questions");
  if (req.openQuestions?.length) {
    for (const q of req.openQuestions) {
      lines.push(`- ? ${q}`);
    }
  } else {
    lines.push("_No open questions_");
  }
  lines.push("");

  lines.push("## Technical Notes");
  lines.push(req.technicalNotes || "_Implementation notes will be added here_");
  lines.push("");

  return lines.join("\n");
}

async function findRequirement(reqId) {
  ensureDirectoriesSync();

  for (const dir of STATUSES) {
    const dirPath = join(REQUIREMENTS_DIR, dir);
    try {
      const files = await readdir(dirPath);
      for (const file of files) {
        if (file.startsWith(reqId) && file.endsWith(".md")) {
          const fullPath = join(dirPath, file);
          const content = await readFile(fullPath, "utf-8");
          return {
            requirement: parseRequirementFile(content, file),
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

export const requirementsModule = {
  name: "requirements",
  description: "Requirements management for PRDs, specs, user stories, and features",

  tools: [
    {
      name: "req_list",
      description: "List requirements with filtering",
      inputSchema: {
        type: "object",
        properties: {
          status: {
            type: "string",
            description: "Filter by status: draft, review, approved, implemented, deprecated",
          },
          type: {
            type: "string",
            description: "Filter by type: prd, tech-spec, user-story, epic, feature",
          },
          priority: {
            type: "string",
            description: "Filter by priority: P0, P1, P2, P3",
          },
          search: {
            type: "string",
            description: "Search in title and description",
          },
        },
      },
      handler: async ({ status, type, priority, search }) => {
        ensureDirectoriesSync();
        const requirements = [];

        const statusFilter = status ? [status] : STATUSES.filter(s => s !== "deprecated");

        for (const dir of statusFilter) {
          const dirPath = join(REQUIREMENTS_DIR, dir);
          try {
            const files = await readdir(dirPath);
            for (const file of files) {
              if (file.endsWith(".md") && file !== "README.md") {
                const content = await readFile(join(dirPath, file), "utf-8");
                const req = parseRequirementFile(content, file);

                if (type && req.type !== type) continue;
                if (priority && req.priority !== priority) continue;
                if (search) {
                  const searchLower = search.toLowerCase();
                  const matches =
                    req.id?.toLowerCase().includes(searchLower) ||
                    req.title?.toLowerCase().includes(searchLower) ||
                    req.description?.toLowerCase().includes(searchLower);
                  if (!matches) continue;
                }

                requirements.push({
                  id: req.id,
                  title: req.title,
                  type: req.type,
                  status: dir,
                  priority: req.priority || "P2",
                  linkedTasks: req.linkedTasks?.length || 0,
                  created: req.created,
                  updated: req.updated,
                });
              }
            }
          } catch {}
        }

        requirements.sort((a, b) => {
          if (a.priority !== b.priority) return a.priority.localeCompare(b.priority);
          return a.id.localeCompare(b.id);
        });

        return { requirements, total: requirements.length };
      },
    },

    {
      name: "req_get",
      description: "Get full details of a specific requirement",
      inputSchema: {
        type: "object",
        properties: {
          reqId: {
            type: "string",
            description: "Requirement ID (e.g., PRD-001, SPEC-002)",
          },
        },
        required: ["reqId"],
      },
      handler: async ({ reqId }) => {
        const result = await findRequirement(reqId);
        if (!result) {
          return { error: `Requirement ${reqId} not found` };
        }
        return {
          ...result.requirement,
          path: result.path,
          rawContent: result.content,
        };
      },
    },

    {
      name: "req_create",
      description: "Create a new requirement",
      inputSchema: {
        type: "object",
        properties: {
          type: {
            type: "string",
            description: "Type: prd, tech-spec, user-story, epic, feature",
          },
          title: { type: "string", description: "Requirement title" },
          description: { type: "string", description: "Detailed description" },
          priority: { type: "string", description: "Priority: P0, P1, P2, P3" },
          repos: { type: "array", items: { type: "string" }, description: "Repos this requirement affects" },
          acceptanceCriteria: { type: "array", items: { type: "string" }, description: "Acceptance criteria" },
          author: { type: "string", description: "Author name" },
        },
        required: ["type", "title"],
      },
      handler: async ({ type, title, description, priority, repos, acceptanceCriteria, author }) => {
        ensureDirectoriesSync();

        const id = generateRequirementId(type);
        const req = {
          id,
          type,
          title,
          status: "draft",
          priority: priority || "P2",
          created: getToday(),
          author: author || "Unknown",
          repos: repos || [],
          description,
          acceptanceCriteria: acceptanceCriteria || [],
        };

        const content = generateRequirementContent(req);
        const filename = `${id}-${title.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 50)}.md`;
        const filePath = join(REQUIREMENTS_DIR, "draft", filename);

        await writeFile(filePath, content, "utf-8");

        return {
          success: true,
          reqId: id,
          path: `draft/${filename}`,
          message: `Created requirement: ${id} - ${title}`,
        };
      },
    },

    {
      name: "req_update_status",
      description: "Update requirement status (workflow: draft -> review -> approved -> implemented)",
      inputSchema: {
        type: "object",
        properties: {
          reqId: { type: "string", description: "Requirement ID" },
          status: {
            type: "string",
            description: "New status: draft, review, approved, implemented, deprecated",
          },
        },
        required: ["reqId", "status"],
      },
      handler: async ({ reqId, status }) => {
        const result = await findRequirement(reqId);
        if (!result) return { error: `Requirement ${reqId} not found` };

        const currentDir = result.path.split("/")[0];
        if (currentDir === status) {
          return { success: true, message: `Requirement ${reqId} is already ${status}` };
        }

        const today = getToday();
        const newContent = result.content
          .replace(/\*\*Status\*\*: \w+/, `**Status**: ${status}`)
          .replace(/\*\*Updated\*\*: [\d-]+/, `**Updated**: ${today}`);

        const filename = basename(result.path);
        const newPath = join(REQUIREMENTS_DIR, status, filename);

        await writeFile(newPath, newContent, "utf-8");
        await unlink(result.fullPath);

        return { success: true, message: `Updated ${reqId} to ${status}` };
      },
    },

    {
      name: "req_link_task",
      description: "Link a requirement to a task",
      inputSchema: {
        type: "object",
        properties: {
          reqId: { type: "string", description: "Requirement ID" },
          taskId: { type: "string", description: "Task ID (e.g., TASK-001)" },
        },
        required: ["reqId", "taskId"],
      },
      handler: async ({ reqId, taskId }) => {
        const result = await findRequirement(reqId);
        if (!result) return { error: `Requirement ${reqId} not found` };

        const today = getToday();
        let newContent = result.content.replace(
          /## Linked Tasks\n([\s\S]*?)(?=\n## )/,
          (match, existing) => {
            const trimmed = existing.trim();
            if (trimmed === "_No tasks linked yet_") {
              return `## Linked Tasks\n- ${taskId}\n\n`;
            }
            if (trimmed.includes(taskId)) return match;
            return `## Linked Tasks\n${trimmed}\n- ${taskId}\n\n`;
          }
        ).replace(/\*\*Updated\*\*: [\d-]+/, `**Updated**: ${today}`);

        await writeFile(result.fullPath, newContent, "utf-8");
        return { success: true, message: `Linked ${taskId} to ${reqId}` };
      },
    },

    {
      name: "req_link_requirement",
      description: "Link two requirements together",
      inputSchema: {
        type: "object",
        properties: {
          reqId: { type: "string", description: "Source requirement ID" },
          linkedReqId: { type: "string", description: "Target requirement ID to link" },
        },
        required: ["reqId", "linkedReqId"],
      },
      handler: async ({ reqId, linkedReqId }) => {
        const result = await findRequirement(reqId);
        if (!result) return { error: `Requirement ${reqId} not found` };

        const today = getToday();
        let newContent = result.content.replace(
          /## Related Requirements\n([\s\S]*?)(?=\n## )/,
          (match, existing) => {
            const trimmed = existing.trim();
            if (trimmed === "_No related requirements_") {
              return `## Related Requirements\n- ${linkedReqId}\n\n`;
            }
            if (trimmed.includes(linkedReqId)) return match;
            return `## Related Requirements\n${trimmed}\n- ${linkedReqId}\n\n`;
          }
        ).replace(/\*\*Updated\*\*: [\d-]+/, `**Updated**: ${today}`);

        await writeFile(result.fullPath, newContent, "utf-8");
        return { success: true, message: `Linked ${linkedReqId} to ${reqId}` };
      },
    },

    {
      name: "req_add_question",
      description: "Add an open question to a requirement",
      inputSchema: {
        type: "object",
        properties: {
          reqId: { type: "string", description: "Requirement ID" },
          question: { type: "string", description: "The question to add" },
        },
        required: ["reqId", "question"],
      },
      handler: async ({ reqId, question }) => {
        const result = await findRequirement(reqId);
        if (!result) return { error: `Requirement ${reqId} not found` };

        const today = getToday();
        let newContent = result.content.replace(
          /## Open Questions\n([\s\S]*?)(?=\n## |$)/,
          (match, existing) => {
            const trimmed = existing.trim();
            if (trimmed === "_No open questions_") {
              return `## Open Questions\n- ? ${question}\n\n`;
            }
            return `## Open Questions\n${trimmed}\n- ? ${question}\n\n`;
          }
        ).replace(/\*\*Updated\*\*: [\d-]+/, `**Updated**: ${today}`);

        await writeFile(result.fullPath, newContent, "utf-8");
        return { success: true, message: `Added question to ${reqId}` };
      },
    },

    {
      name: "req_add_criterion",
      description: "Add an acceptance criterion to a requirement",
      inputSchema: {
        type: "object",
        properties: {
          reqId: { type: "string", description: "Requirement ID" },
          criterion: { type: "string", description: "Acceptance criterion to add" },
        },
        required: ["reqId", "criterion"],
      },
      handler: async ({ reqId, criterion }) => {
        const result = await findRequirement(reqId);
        if (!result) return { error: `Requirement ${reqId} not found` };

        const today = getToday();
        let newContent = result.content.replace(
          /## Acceptance Criteria\n([\s\S]*?)(?=\n## )/,
          (match, existing) => {
            const trimmed = existing.trim();
            if (trimmed === "- [ ] _Add acceptance criteria_") {
              return `## Acceptance Criteria\n- [ ] ${criterion}\n\n`;
            }
            return `## Acceptance Criteria\n${trimmed}\n- [ ] ${criterion}\n\n`;
          }
        ).replace(/\*\*Updated\*\*: [\d-]+/, `**Updated**: ${today}`);

        await writeFile(result.fullPath, newContent, "utf-8");
        return { success: true, message: `Added criterion to ${reqId}` };
      },
    },

    {
      name: "req_generate_spec",
      description: "Generate a tech-spec template from a PRD",
      inputSchema: {
        type: "object",
        properties: {
          prdId: { type: "string", description: "PRD ID to generate spec from" },
        },
        required: ["prdId"],
      },
      handler: async ({ prdId }) => {
        const prd = await findRequirement(prdId);
        if (!prd || prd.requirement.type !== "prd") {
          return { error: `${prdId} is not a valid PRD` };
        }

        const specId = generateRequirementId("tech-spec");
        const spec = {
          id: specId,
          type: "tech-spec",
          title: `Technical Spec for ${prd.requirement.title}`,
          status: "draft",
          priority: prd.requirement.priority,
          created: getToday(),
          description: `Technical specification for ${prdId}: ${prd.requirement.title}`,
          linkedRequirements: [prdId],
          acceptanceCriteria: prd.requirement.acceptanceCriteria || [],
        };

        const content = generateRequirementContent(spec);
        const filename = `${specId}-tech-spec-for-${prdId.toLowerCase()}.md`;
        const filePath = join(REQUIREMENTS_DIR, "draft", filename);

        await writeFile(filePath, content, "utf-8");

        // Also link back from PRD
        const today = getToday();
        let prdContent = prd.content.replace(
          /## Related Requirements\n([\s\S]*?)(?=\n## )/,
          (match, existing) => {
            const trimmed = existing.trim();
            if (trimmed === "_No related requirements_") {
              return `## Related Requirements\n- ${specId}\n\n`;
            }
            return `## Related Requirements\n${trimmed}\n- ${specId}\n\n`;
          }
        ).replace(/\*\*Updated\*\*: [\d-]+/, `**Updated**: ${today}`);

        await writeFile(prd.fullPath, prdContent, "utf-8");

        return {
          success: true,
          specId,
          prdId,
          message: `Generated tech-spec ${specId} from ${prdId}`,
        };
      },
    },

    {
      name: "req_traceability",
      description: "Get traceability matrix showing requirements and linked tasks",
      inputSchema: {
        type: "object",
        properties: {},
      },
      handler: async () => {
        ensureDirectoriesSync();
        const matrix = [];

        for (const dir of STATUSES) {
          const dirPath = join(REQUIREMENTS_DIR, dir);
          try {
            const files = await readdir(dirPath);
            for (const file of files) {
              if (file.endsWith(".md") && file !== "README.md") {
                const content = await readFile(join(dirPath, file), "utf-8");
                const req = parseRequirementFile(content, file);

                matrix.push({
                  id: req.id,
                  title: req.title,
                  type: req.type,
                  status: dir,
                  linkedTasks: req.linkedTasks || [],
                  linkedRequirements: req.linkedRequirements || [],
                  hasOpenQuestions: (req.openQuestions?.length || 0) > 0,
                });
              }
            }
          } catch {}
        }

        const stats = {
          total: matrix.length,
          byStatus: {},
          byType: {},
          withTasks: matrix.filter(r => r.linkedTasks.length > 0).length,
          withOpenQuestions: matrix.filter(r => r.hasOpenQuestions).length,
        };

        for (const req of matrix) {
          stats.byStatus[req.status] = (stats.byStatus[req.status] || 0) + 1;
          stats.byType[req.type] = (stats.byType[req.type] || 0) + 1;
        }

        return { matrix, stats };
      },
    },
  ],
};
