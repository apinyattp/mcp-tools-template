// ── Shared Helpers ─────────────────────────────────────

// Add your shared utility functions here.
// All tool files can import from this file.

// ── Confluence Helpers ──────────────────────────────────

/** Convert Confluence XHTML storage format to plain text. */
export function stripHtmlToText(html: string): string {
  let text = html;

  // Preserve code block content from Confluence macros
  text = text.replace(
    /<ac:structured-macro[^>]*ac:name="code"[^>]*>[\s\S]*?<\/ac:structured-macro>/gi,
    (match) => {
      const bodyMatch = match.match(
        /<ac:plain-text-body>\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*<\/ac:plain-text-body>/,
      );
      return bodyMatch ? `\n\`\`\`\n${bodyMatch[1]}\n\`\`\`\n` : "";
    },
  );

  // Remove remaining Confluence custom elements (ac:*, ri:*)
  text = text.replace(/<\/?(ac|ri):[^>]*>/g, "");

  // Convert block elements to newlines
  text = text.replace(/<\/(p|div|h[1-6]|li|tr|blockquote)>/gi, "\n");
  text = text.replace(/<br\s*\/?>/gi, "\n");
  text = text.replace(/<\/(td|th)>/gi, "\t");

  // Remove all remaining HTML tags
  text = text.replace(/<[^>]+>/g, "");

  // Decode HTML entities
  text = text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");

  // Collapse multiple newlines and trim
  text = text.replace(/\n{3,}/g, "\n\n").trim();

  return text;
}

/** Extract Confluence page ID from various URL formats. */
export function extractConfluencePageId(url: string): string | null {
  try {
    const parsed = new URL(url);

    // Format: /wiki/spaces/SPACE/pages/123456/Title
    const pathMatch = parsed.pathname.match(/\/pages\/(\d+)/);
    if (pathMatch) return pathMatch[1];

    // Format: /wiki/pages/viewpage.action?pageId=123456
    const pageId = parsed.searchParams.get("pageId");
    if (pageId && /^\d+$/.test(pageId)) return pageId;

    return null;
  } catch {
    return null;
  }
}

/** Build Basic auth header for Confluence API. */
export function buildConfluenceAuth(
  email: string,
  apiToken: string,
): string {
  return `Basic ${Buffer.from(`${email}:${apiToken}`).toString("base64")}`;
}

/** Make an authenticated GET request to a Confluence REST endpoint. */
export async function confluenceFetch(
  baseUrl: string,
  path: string,
  email: string,
  apiToken: string,
): Promise<{ ok: boolean; status: number; data: any }> {
  const normalizedBase = baseUrl.replace(/\/+$/, "");
  const response = await fetch(`${normalizedBase}${path}`, {
    method: "GET",
    headers: {
      Authorization: buildConfluenceAuth(email, apiToken),
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    return { ok: false, status: response.status, data: null };
  }

  const data = await response.json();
  return { ok: true, status: response.status, data };
}
