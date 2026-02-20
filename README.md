# MCP Tools Template

A ready-to-use NestJS MCP (Model Context Protocol) server template with OAuth 2.1 authentication and pre-built tools.

## Features

- **MCP Server** — Stateless StreamableHTTP transport, compatible with Claude and other MCP clients
- **OAuth 2.1** — Authorization code flow with PKCE (S256), dynamic client registration
- **Pre-built Tools:**
  - `fetch_api` — Call any external REST API with auto-login support
  - `fetch_confluence_page` — Fetch a Confluence page by URL
  - `search_confluence` — Search Confluence pages by keyword
- **Dynamic Tool Loading** — Drop a `.ts` file in `src/tools/` and it's auto-discovered

## Quick Start

```bash
# Install dependencies
npm install

# Copy env file
cp .env.example .env

# Run in development
npm run dev
```

The MCP endpoint will be available at `http://localhost:3000/mcp`.

## Add to Claude

```json
{
  "type": "url",
  "url": "https://your-domain.com/mcp"
}
```

**OAuth Credentials** (default):
- Client ID: `mcp-client`
- Client Secret: `mcp-secret-change-in-production`

Configure via `MCP_OAUTH_CLIENT_ID` and `MCP_OAUTH_CLIENT_SECRET` env vars.

## Adding a New Tool

1. Create a new file in `src/tools/`, e.g. `src/tools/my-tool.ts`:

```typescript
import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { type ToolDefinition, type ToolContext } from "./index";

const definition: ToolDefinition = {
  name: "my_tool",
  register(server: McpServer, _context: ToolContext) {
    server.tool(
      "my_tool",
      "Description of what the tool does.",
      {
        param1: z.string().describe("Parameter description"),
      },
      async ({ param1 }) => {
        // Your tool logic here
        return {
          content: [{ type: "text" as const, text: `Result: ${param1}` }],
        };
      },
    );
  },
};

export default definition;
```

2. Add the tool name to the `tools` array in `src/mcp.controller.ts`:

```typescript
const tools: string[] = [
  "fetch_confluence_page",
  "search_confluence",
  "fetch_api",
  "my_tool", // <-- add here
];
```

3. Restart the server — the tool is now available to MCP clients.

## Docker

```bash
docker compose up --build
```

## Project Structure

```
src/
├── main.ts                  # Entry point
├── app.module.ts            # Root NestJS module
├── mcp.controller.ts        # MCP endpoint (POST /mcp)
├── common/
│   └── decorators/
│       └── public.decorator.ts
├── mcp-auth/                # OAuth 2.1 implementation
│   ├── mcp-auth.module.ts
│   ├── mcp-oauth.controller.ts
│   ├── mcp-oauth.service.ts
│   └── mcp-oauth.store.ts
└── tools/                   # MCP tools (auto-discovered)
    ├── index.ts             # Tool loader + ToolContext interface
    ├── helpers.ts           # Shared utilities
    ├── fetch-api.ts         # Generic API caller with auto-login
    ├── fetch-confluence-page.ts
    └── search-confluence.ts
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | Server port |
| `MCP_OAUTH_CLIENT_ID` | `mcp-client` | OAuth client ID |
| `MCP_OAUTH_CLIENT_SECRET` | `mcp-secret-change-in-production` | OAuth client secret |
| `CORS_ORIGINS` | `*` | Comma-separated allowed origins |
