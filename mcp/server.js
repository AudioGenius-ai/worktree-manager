#!/usr/bin/env node

import { createInterface } from "node:readline";
import { gitModule, githubModule, tasksModule, requirementsModule } from "./modules/index.js";

const SERVER_NAME = "worktree-manager";
const SERVER_VERSION = "2.0.0";
const PROTOCOL_VERSION = "2024-11-05";

// Register all modules
const modules = [gitModule, githubModule, tasksModule, requirementsModule];

// Build tools list from all modules
const allTools = modules.flatMap((m) =>
  m.tools.map((t) => ({
    ...t,
    module: m.name,
    handler: t.handler,
  }))
);

// Create readline interface for stdio transport
const rl = createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: false,
});

function sendResponse(id, result) {
  const response = { jsonrpc: "2.0", id, result };
  console.log(JSON.stringify(response));
}

function sendError(id, code, message) {
  const response = { jsonrpc: "2.0", id, error: { code, message } };
  console.log(JSON.stringify(response));
}

rl.on("line", async (line) => {
  try {
    const request = JSON.parse(line);
    const { method, id, params } = request;

    switch (method) {
      case "initialize":
        sendResponse(id, {
          protocolVersion: PROTOCOL_VERSION,
          capabilities: {
            tools: {},
          },
          serverInfo: {
            name: SERVER_NAME,
            version: SERVER_VERSION,
          },
        });
        break;

      case "tools/list":
        sendResponse(id, {
          tools: allTools.map((t) => ({
            name: t.name,
            description: t.description,
            inputSchema: t.inputSchema,
          })),
        });
        break;

      case "tools/call": {
        const { name, arguments: args } = params;
        const tool = allTools.find((t) => t.name === name);

        if (!tool) {
          sendError(id, -32601, `Unknown tool: ${name}`);
          break;
        }

        try {
          const result = await tool.handler(args || {});
          sendResponse(id, {
            content: [
              {
                type: "text",
                text: JSON.stringify(result, null, 2),
              },
            ],
          });
        } catch (err) {
          sendError(id, -32603, err.message);
        }
        break;
      }

      case "notifications/initialized":
        // Client acknowledged initialization
        break;

      default:
        // Ignore unknown methods
        break;
    }
  } catch (err) {
    // Ignore parse errors
  }
});

// Handle graceful shutdown
process.on("SIGINT", () => process.exit(0));
process.on("SIGTERM", () => process.exit(0));
