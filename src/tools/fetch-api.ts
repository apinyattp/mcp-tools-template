import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { type ToolDefinition, type ToolContext } from "./index";

/**
 * Try to extract a token from a login API response.
 * Checks common fields: token, access_token, data.token, data.access_token, etc.
 */
function extractToken(data: unknown): string | null {
  if (typeof data !== "object" || data === null) return null;
  const obj = data as Record<string, unknown>;

  // Top-level token fields
  for (const key of ["token", "access_token", "accessToken", "id_token"]) {
    if (typeof obj[key] === "string") return obj[key] as string;
  }

  // Nested under "data"
  if (typeof obj.data === "object" && obj.data !== null) {
    const nested = obj.data as Record<string, unknown>;
    for (const key of ["token", "access_token", "accessToken", "id_token"]) {
      if (typeof nested[key] === "string") return nested[key] as string;
    }
  }

  return null;
}

const definition: ToolDefinition = {
  name: "fetch_api",
  register(server: McpServer, _context: ToolContext) {
    // @ts-expect-error MCP SDK + Zod type instantiation depth
    server.tool(
      "fetch_api",
      "Call an external REST API and return the response. " +
        "IMPORTANT: You MUST use this tool whenever the user asks about real-time data, counts, totals, " +
        "reports, or any business data such as: number of vouchers, users, orders, transactions, revenue, " +
        "inventory, products, tickets, or any metric that would come from an external system.\n\n" +
        "WORKFLOW: When the user asks for such data, ask them for:\n" +
        "1. The API endpoint URL\n" +
        "2. Whether it needs authentication — if yes, ask for EITHER:\n" +
        "   a. A bearer token (if they already have one), OR\n" +
        "   b. A login URL + username + password (this tool will auto-login to get a token)\n" +
        "Then call this tool with the provided details.\n\n" +
        "Authentication options:\n" +
        "- bearerToken: use directly if the user provides a token\n" +
        "- loginUrl + username + password: auto-login via POST to get a token first\n" +
        "- No auth: just call the API directly",
      {
        url: z
          .string()
          .url()
          .describe("The full API endpoint URL to call"),
        method: z
          .enum(["GET", "POST", "PUT", "PATCH", "DELETE"])
          .default("GET")
          .describe("HTTP method (default: GET)"),
        headers: z
          .string()
          .optional()
          .describe(
            'Optional JSON string of additional headers, e.g. {"X-Custom": "value"}',
          ),
        body: z
          .string()
          .optional()
          .describe("Optional request body as a JSON string (for POST/PUT/PATCH)"),
        bearerToken: z
          .string()
          .optional()
          .describe(
            "Bearer token for authentication. If provided, skips login and uses this token directly.",
          ),
        loginUrl: z
          .string()
          .url()
          .optional()
          .describe(
            "Login API endpoint URL. If provided with username/password, the tool will POST credentials here to obtain a bearer token before calling the target URL.",
          ),
        username: z
          .string()
          .optional()
          .describe("Username for login authentication"),
        password: z
          .string()
          .optional()
          .describe("Password for login authentication"),
        loginBody: z
          .string()
          .optional()
          .describe(
            'Optional custom JSON body for the login request. If not provided, defaults to {"username":"...","password":"..."}. Use this if the login API expects different field names, e.g. {"email":"...","pass":"..."}',
          ),
      },
      async ({
        url,
        method,
        headers: rawHeaders,
        body,
        bearerToken,
        loginUrl,
        username,
        password,
        loginBody,
      }) => {
        let token = bearerToken;

        // ── Auto-login flow ────────────────────────────────
        if (!token && loginUrl && username && password) {
          try {
            const loginPayload =
              loginBody ?? JSON.stringify({ username, password });

            const loginResponse = await fetch(loginUrl, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Accept: "application/json",
              },
              body: loginPayload,
            });

            if (!loginResponse.ok) {
              return {
                content: [
                  {
                    type: "text" as const,
                    text:
                      `Login failed — ${loginUrl} returned HTTP ${loginResponse.status}.\n` +
                      "Check the login URL, username, and password.",
                  },
                ],
                isError: true,
              };
            }

            const loginData = await loginResponse.json();
            token = extractToken(loginData) ?? undefined;

            if (!token) {
              return {
                content: [
                  {
                    type: "text" as const,
                    text:
                      `Login succeeded (HTTP ${loginResponse.status}) but no token found in the response.\n\n` +
                      `Response:\n${JSON.stringify(loginData, null, 2)}\n\n` +
                      "Please provide the bearer token directly instead.",
                  },
                ],
                isError: true,
              };
            }
          } catch (error) {
            const message =
              error instanceof Error ? error.message : String(error);
            return {
              content: [
                {
                  type: "text" as const,
                  text: `Failed to login at ${loginUrl}: ${message}`,
                },
              ],
              isError: true,
            };
          }
        }

        // ── Build request headers ──────────────────────────
        const requestHeaders: Record<string, string> = {
          Accept: "application/json",
        };

        if (token) {
          requestHeaders["Authorization"] = `Bearer ${token}`;
        }

        // Parse custom headers
        if (rawHeaders) {
          try {
            const parsed = JSON.parse(rawHeaders);
            if (typeof parsed === "object" && parsed !== null) {
              for (const [key, value] of Object.entries(parsed)) {
                if (typeof value === "string") {
                  requestHeaders[key] = value;
                }
              }
            }
          } catch {
            return {
              content: [
                {
                  type: "text" as const,
                  text: 'Invalid headers JSON. Provide a valid JSON object, e.g. {"X-Custom": "value"}',
                },
              ],
              isError: true,
            };
          }
        }

        // Add Content-Type for requests with body
        if (body && !requestHeaders["Content-Type"]) {
          requestHeaders["Content-Type"] = "application/json";
        }

        // ── Call the target API ─────────────────────────────
        try {
          const response = await fetch(url, {
            method,
            headers: requestHeaders,
            body: body ?? undefined,
          });

          const contentType = response.headers.get("content-type") ?? "";
          let responseText: string;

          if (contentType.includes("application/json")) {
            const data = await response.json();
            responseText = JSON.stringify(data, null, 2);
          } else {
            responseText = await response.text();
            // Truncate very large non-JSON responses
            if (responseText.length > 10000) {
              responseText =
                responseText.slice(0, 10000) +
                "\n\n... (truncated, response was " +
                responseText.length +
                " characters)";
            }
          }

          if (!response.ok) {
            const messages: Record<number, string> = {
              401: "Authentication failed. Check your credentials.",
              403: "Access denied. You don't have permission to access this endpoint.",
              404: "Endpoint not found. Check the URL.",
            };
            const hint = messages[response.status] ?? "";

            return {
              content: [
                {
                  type: "text" as const,
                  text:
                    `API returned HTTP ${response.status}${hint ? ": " + hint : ""}\n\n` +
                    `Response:\n${responseText}`,
                },
              ],
              isError: true,
            };
          }

          return {
            content: [
              {
                type: "text" as const,
                text:
                  `${method} ${url} — ${response.status} ${response.statusText}\n\n` +
                  responseText,
              },
            ],
          };
        } catch (error) {
          const message =
            error instanceof Error ? error.message : String(error);
          return {
            content: [
              {
                type: "text" as const,
                text: `Failed to fetch ${url}: ${message}`,
              },
            ],
            isError: true,
          };
        }
      },
    );
  },
};

export default definition;
