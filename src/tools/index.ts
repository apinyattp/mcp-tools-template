import * as fs from "fs";
import * as path from "path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

/**
 * Add your own services/dependencies here.
 * Tools receive this context so they can access shared resources.
 */
export interface ToolContext {
  // Example: dbService: DatabaseService;
}

export interface ToolDefinition {
  name: string;
  register(server: McpServer, context: ToolContext): void;
}

let allTools: ToolDefinition[] | null = null;

async function loadAllTools(): Promise<ToolDefinition[]> {
  if (allTools) return allTools;

  const toolsDir = path.dirname(__filename);
  const files = fs.readdirSync(toolsDir).filter((f) => {
    return (
      (f.endsWith(".ts") || f.endsWith(".js")) &&
      f !== "index.ts" &&
      f !== "index.js" &&
      f !== "helpers.ts" &&
      f !== "helpers.js"
    );
  });

  allTools = [];
  for (const file of files) {
    const mod = await import(path.join(toolsDir, file));
    const def: ToolDefinition = mod.default;
    if (def && def.name && typeof def.register === "function") {
      allTools.push(def);
    }
  }

  return allTools;
}

export async function registerTools(
  server: McpServer,
  allowedTools: string[],
  context: ToolContext,
): Promise<void> {
  const tools = await loadAllTools();
  for (const tool of tools) {
    if (allowedTools.includes(tool.name)) {
      tool.register(server, context);
    }
  }
}
