import { Controller, Post, Get, Delete, Inject, Req, Res } from "@nestjs/common";
import { Request, Response } from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { registerTools, type ToolContext } from "./tools/index";
import { McpOAuthService } from "./mcp-auth/mcp-oauth.service";
import { Public } from "./common/decorators/public.decorator";

async function createServer(
  allowedTools: string[],
  context: ToolContext,
): Promise<McpServer> {
  const server = new McpServer(
    { name: "mcp-server", version: "1.0.0" },
    { capabilities: { logging: {} } },
  );

  await registerTools(server, allowedTools, context);

  return server;
}

@Public()
@Controller("mcp")
export class McpController {
  constructor(
    @Inject(McpOAuthService)
    private mcpOAuthService: McpOAuthService,
  ) {}

  private getBaseUrl(req: Request): string {
    const proto =
      (req.headers["x-forwarded-proto"] as string) || req.protocol;
    const host =
      (req.headers["x-forwarded-host"] as string) || req.get("host");
    return `${proto}://${host}`;
  }

  @Post()
  async handleMcpRequest(@Req() req: Request, @Res() res: Response) {
    // Validate OAuth Bearer token
    const authHeader = req.headers.authorization;
    const token = authHeader?.replace(/^Bearer\s+/i, "").trim();

    if (!token || !this.mcpOAuthService.validateAccessToken(token)) {
      const baseUrl = this.getBaseUrl(req);
      res
        .status(401)
        .setHeader(
          "WWW-Authenticate",
          `Bearer resource_metadata="${baseUrl}/.well-known/oauth-protected-resource"`,
        )
        .json({
          jsonrpc: "2.0",
          error: { code: -32001, message: "Unauthorized" },
          id: null,
        });
      return;
    }

    try {
      // ── Configure your allowed tools here ──────────────
      const tools: string[] = [
        "fetch_confluence_page",
        "search_confluence",
        "fetch_api",
      ];
      const context: ToolContext = {
        // Add your service instances here
      };
      const server = await createServer(tools, context);
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
      });

      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);

      res.on("close", () => {
        transport.close();
        server.close();
      });
    } catch (error) {
      console.error("Error handling MCP request:", error);
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: "2.0",
          error: { code: -32603, message: "Internal server error" },
          id: null,
        });
      }
    }
  }

  @Get()
  methodNotAllowedGet(@Res() res: Response) {
    res.status(405).json({
      jsonrpc: "2.0",
      error: {
        code: -32000,
        message: "Method not allowed in stateless mode.",
      },
      id: null,
    });
  }

  @Delete()
  methodNotAllowedDelete(@Res() res: Response) {
    res.status(405).json({
      jsonrpc: "2.0",
      error: {
        code: -32000,
        message: "Method not allowed in stateless mode.",
      },
      id: null,
    });
  }
}
