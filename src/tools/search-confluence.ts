import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { stripHtmlToText, confluenceFetch } from "./helpers";
import { type ToolDefinition, type ToolContext } from "./index";

const definition: ToolDefinition = {
  name: "search_confluence",
  register(server: McpServer, _context: ToolContext) {
    // @ts-expect-error MCP SDK + Zod type instantiation depth
    server.tool(
      "search_confluence",
      "Search Confluence pages by keyword. Returns matching page titles, spaces, excerpts, and URLs. " +
        "The user must provide their Confluence base URL (e.g. https://company.atlassian.net), email, and API token.",
      {
        confluenceBaseUrl: z
          .string()
          .url()
          .describe(
            "Confluence base URL, e.g. https://company.atlassian.net (no /wiki suffix)",
          ),
        email: z
          .string()
          .email()
          .describe("Confluence account email for authentication"),
        apiToken: z
          .string()
          .min(1)
          .describe("Confluence API token for authentication"),
        query: z
          .string()
          .min(1)
          .describe("Search keywords to find in Confluence pages"),
        limit: z
          .number()
          .min(1)
          .max(25)
          .default(5)
          .describe("Maximum number of results to return (default: 5)"),
      },
      async ({ confluenceBaseUrl, email, apiToken, query, limit }) => {
        const escapedQuery = query.replace(/"/g, '\\"');
        const cql = `type=page AND text~"${escapedQuery}"`;
        const path = `/wiki/rest/api/search?cql=${encodeURIComponent(cql)}&limit=${limit}`;

        const result = await confluenceFetch(
          confluenceBaseUrl,
          path,
          email,
          apiToken,
        );

        if (!result.ok) {
          const messages: Record<number, string> = {
            401: "Authentication failed. Check your email and API token.",
            403: "Access denied. Check your permissions.",
          };
          return {
            content: [
              {
                type: "text" as const,
                text:
                  messages[result.status] ??
                  `Confluence search API returned HTTP ${result.status}.`,
              },
            ],
            isError: true,
          };
        }

        const results = result.data.results ?? [];

        if (results.length === 0) {
          return {
            content: [
              {
                type: "text" as const,
                text: `No Confluence pages found for "${query}".`,
              },
            ],
          };
        }

        const normalizedBase = confluenceBaseUrl.replace(/\/+$/, "");

        const entries = results.map((r: any, i: number) => {
          const title = r.content?.title ?? r.title ?? "Untitled";
          const spaceKey =
            r.content?.space?.key ??
            r.resultGlobalContainer?.displayUrl ??
            "";
          const spaceName =
            r.content?.space?.name ??
            r.resultGlobalContainer?.title ??
            "Unknown";
          const pageId = r.content?.id ?? "";
          const webUiLink = r.content?._links?.webui ?? "";
          const fullUrl = webUiLink
            ? `${normalizedBase}/wiki${webUiLink}`
            : "";

          const excerpt = r.excerpt
            ? stripHtmlToText(r.excerpt)
            : "(no excerpt)";

          const lastModified = r.lastModified
            ? new Date(r.lastModified).toLocaleString()
            : "";

          const lines = [`${i + 1}. **${title}**`];
          lines.push(`   Space: ${spaceName} (${spaceKey})`);
          if (pageId) lines.push(`   Page ID: ${pageId}`);
          if (fullUrl) lines.push(`   URL: ${fullUrl}`);
          if (lastModified) lines.push(`   Last modified: ${lastModified}`);
          lines.push(`   ${excerpt}`);

          return lines.join("\n");
        });

        return {
          content: [
            {
              type: "text" as const,
              text: `Found ${results.length} Confluence page(s) for "${query}":\n\n${entries.join("\n\n")}`,
            },
          ],
        };
      },
    );
  },
};

export default definition;
