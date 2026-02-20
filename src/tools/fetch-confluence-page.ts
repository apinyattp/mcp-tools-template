import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  stripHtmlToText,
  extractConfluencePageId,
  confluenceFetch,
} from "./helpers";
import { type ToolDefinition, type ToolContext } from "./index";

const definition: ToolDefinition = {
  name: "fetch_confluence_page",
  register(server: McpServer, _context: ToolContext) {
    // @ts-expect-error MCP SDK + Zod type instantiation depth
    server.tool(
      "fetch_confluence_page",
      "Fetch a specific Confluence page by its URL. Returns the page title, space, last-modified info, and plain-text content. " +
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
        pageUrl: z
          .string()
          .url()
          .describe(
            "Full URL of the Confluence page to fetch",
          ),
      },
      async ({ confluenceBaseUrl, email, apiToken, pageUrl }) => {
        const pageId = extractConfluencePageId(pageUrl);
        if (!pageId) {
          return {
            content: [
              {
                type: "text" as const,
                text: `Could not extract a page ID from the URL: ${pageUrl}\n\nExpected formats:\n- https://domain.atlassian.net/wiki/spaces/SPACE/pages/123456/Title\n- https://domain.atlassian.net/wiki/pages/viewpage.action?pageId=123456`,
              },
            ],
            isError: true,
          };
        }

        const result = await confluenceFetch(
          confluenceBaseUrl,
          `/wiki/rest/api/content/${pageId}?expand=body.storage,space,version`,
          email,
          apiToken,
        );

        if (!result.ok) {
          const messages: Record<number, string> = {
            401: "Authentication failed. Check your email and API token.",
            403: "Access denied. You don't have permission to view this page.",
            404: `Page with ID ${pageId} not found. The page may have been deleted or the URL may be incorrect.`,
          };
          return {
            content: [
              {
                type: "text" as const,
                text:
                  messages[result.status] ??
                  `Confluence API returned HTTP ${result.status}.`,
              },
            ],
            isError: true,
          };
        }

        const page = result.data;
        const title = page.title ?? "Untitled";
        const spaceName = page.space?.name ?? "Unknown space";
        const spaceKey = page.space?.key ?? "";
        const version = page.version?.number ?? "?";
        const lastUpdatedBy = page.version?.by?.displayName ?? "Unknown";
        const lastUpdatedDate = page.version?.when
          ? new Date(page.version.when).toLocaleString()
          : "Unknown";

        const rawHtml = page.body?.storage?.value ?? "";
        const plainText = stripHtmlToText(rawHtml);

        const header = [
          `# ${title}`,
          `Space: ${spaceName} (${spaceKey})`,
          `Version: ${version} | Last updated by ${lastUpdatedBy} on ${lastUpdatedDate}`,
          `Page ID: ${pageId}`,
          "",
          "---",
          "",
        ].join("\n");

        return {
          content: [{ type: "text" as const, text: header + plainText }],
        };
      },
    );
  },
};

export default definition;
