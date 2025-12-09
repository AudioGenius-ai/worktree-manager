/**
 * Template MCP Module
 *
 * Copy this file to create your own MCP module.
 * Each module exports a single object with:
 * - name: unique identifier for the module
 * - description: what the module does
 * - tools: array of tool definitions
 *
 * After creating your module:
 * 1. Add it to mcp/modules/index.js
 * 2. Import it in mcp/server.js
 */

export const templateModule = {
  name: "template",
  description: "A template module - copy and modify this",

  tools: [
    {
      name: "template_example_tool",
      description: "An example tool that echoes input",
      inputSchema: {
        type: "object",
        properties: {
          message: {
            type: "string",
            description: "Message to echo back",
          },
          uppercase: {
            type: "boolean",
            description: "Convert to uppercase",
          },
        },
        required: ["message"],
      },
      handler: async ({ message, uppercase }) => {
        // Your tool logic here
        const result = uppercase ? message.toUpperCase() : message;

        return {
          success: true,
          echo: result,
        };
      },
    },

    // Add more tools here...
  ],
};

/**
 * Tool Schema Reference
 *
 * inputSchema follows JSON Schema format:
 *
 * Types:
 * - string: text input
 * - number: numeric input
 * - boolean: true/false
 * - array: list of items
 * - object: nested object
 *
 * Common properties:
 * - description: explain what the parameter does
 * - default: default value if not provided
 * - enum: array of allowed values
 *
 * Example with all types:
 *
 * inputSchema: {
 *   type: "object",
 *   properties: {
 *     name: { type: "string", description: "User name" },
 *     age: { type: "number", description: "User age" },
 *     active: { type: "boolean", description: "Is active" },
 *     tags: {
 *       type: "array",
 *       items: { type: "string" },
 *       description: "List of tags"
 *     },
 *     config: {
 *       type: "object",
 *       properties: {
 *         key: { type: "string" }
 *       }
 *     },
 *     status: {
 *       type: "string",
 *       enum: ["active", "inactive", "pending"],
 *       description: "Status"
 *     }
 *   },
 *   required: ["name"]
 * }
 *
 * Handler Function:
 * - Receives an object with the parsed arguments
 * - Should return an object (will be JSON stringified)
 * - Can be async
 * - Throw errors to return error responses
 */
