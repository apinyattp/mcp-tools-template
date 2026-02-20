import {
  Controller,
  Get,
  Post,
  Req,
  Res,
  Inject,
} from "@nestjs/common";
import { Request, Response } from "express";
import { Public } from "../common/decorators/public.decorator";
import { McpOAuthService } from "./mcp-oauth.service";

@Public()
@Controller()
export class McpOAuthController {
  constructor(
    @Inject(McpOAuthService) private oauthService: McpOAuthService,
  ) {}

  private getBaseUrl(req: Request): string {
    const proto =
      (req.headers["x-forwarded-proto"] as string) || req.protocol;
    const host =
      (req.headers["x-forwarded-host"] as string) || req.get("host");
    return `${proto}://${host}`;
  }

  @Get(".well-known/oauth-protected-resource")
  getProtectedResourceMetadata(
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const baseUrl = this.getBaseUrl(req);
    res.json(this.oauthService.buildProtectedResourceMetadata(baseUrl));
  }

  @Get(".well-known/oauth-authorization-server")
  getAuthServerMetadata(@Req() req: Request, @Res() res: Response) {
    const baseUrl = this.getBaseUrl(req);
    res.json(this.oauthService.buildAuthServerMetadata(baseUrl));
  }

  @Post("oauth/register")
  registerClient(@Req() req: Request, @Res() res: Response) {
    try {
      const client = this.oauthService.registerClient(req.body);
      res.status(201).json(client);
    } catch (err: any) {
      res
        .status(400)
        .json({ error: "invalid_client_metadata", error_description: err.message });
    }
  }

  @Get("oauth/authorize")
  authorize(@Req() req: Request, @Res() res: Response) {
    const {
      client_id,
      redirect_uri,
      code_challenge,
      code_challenge_method,
      state,
      scope,
    } = req.query as Record<string, string>;

    if (!client_id || !redirect_uri || !code_challenge) {
      res.status(400).send("Missing required parameters");
      return;
    }

    const safeClientId = escapeHtml(client_id);
    const safeScope = escapeHtml(scope || "mcp:tools");

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Authorize MCP Client</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, sans-serif; max-width: 480px; margin: 60px auto; padding: 0 20px; }
    .card { border: 1px solid #e2e8f0; border-radius: 12px; padding: 32px; }
    h2 { margin-top: 0; color: #1a202c; }
    .scope { background: #f7fafc; padding: 8px 12px; border-radius: 6px; font-family: monospace; }
    button { background: #3b82f6; color: white; border: none; padding: 12px 24px; border-radius: 8px; font-size: 16px; cursor: pointer; width: 100%; margin-top: 16px; }
    button:hover { background: #2563eb; }
    .subtle { color: #718096; font-size: 14px; }
  </style>
</head>
<body>
  <div class="card">
    <h2>Authorize MCP Client</h2>
    <p>An application is requesting access to your MCP server.</p>
    <p class="subtle">Client: <strong>${safeClientId}</strong></p>
    <p class="subtle">Scope: <span class="scope">${safeScope}</span></p>
    <form method="POST" action="/oauth/authorize">
      <input type="hidden" name="response_type" value="code" />
      <input type="hidden" name="client_id" value="${escapeHtml(client_id)}" />
      <input type="hidden" name="redirect_uri" value="${escapeHtml(redirect_uri)}" />
      <input type="hidden" name="code_challenge" value="${escapeHtml(code_challenge)}" />
      <input type="hidden" name="code_challenge_method" value="${escapeHtml(code_challenge_method || "S256")}" />
      <input type="hidden" name="state" value="${escapeHtml(state || "")}" />
      <input type="hidden" name="scope" value="${escapeHtml(scope || "mcp:tools")}" />
      <button type="submit">Authorize</button>
    </form>
  </div>
</body>
</html>`;

    res
      .setHeader(
        "Content-Security-Policy",
        "default-src 'self'; form-action 'self' https:; style-src 'unsafe-inline'",
      )
      .type("html")
      .send(html);
  }

  @Post("oauth/authorize")
  authorizeApprove(@Req() req: Request, @Res() res: Response) {
    try {
      const {
        client_id,
        redirect_uri,
        code_challenge,
        code_challenge_method,
        state,
        scope,
      } = req.body;

      const result = this.oauthService.createAuthorizationCode({
        client_id,
        redirect_uri,
        code_challenge,
        code_challenge_method: code_challenge_method || "S256",
        scope,
        state,
      });

      const redirectUrl = new URL(result.redirect_uri);
      redirectUrl.searchParams.set("code", result.code);
      if (result.state) {
        redirectUrl.searchParams.set("state", result.state);
      }

      res.redirect(302, redirectUrl.toString());
    } catch (err: any) {
      res.status(400).send(`Authorization error: ${err.message}`);
    }
  }

  @Post("oauth/token")
  token(@Req() req: Request, @Res() res: Response) {
    try {
      const body = { ...req.body };

      const authHeader = req.headers.authorization;
      if (authHeader?.startsWith("Basic ")) {
        const decoded = Buffer.from(
          authHeader.slice(6),
          "base64",
        ).toString();
        const [clientId, clientSecret] = decoded.split(":");
        if (clientId) body.client_id = clientId;
        if (clientSecret) body.client_secret = clientSecret;
      }

      const result = this.oauthService.exchangeCodeForToken(body);
      res.json(result);
    } catch (err: any) {
      res
        .status(400)
        .json({ error: "invalid_grant", error_description: err.message });
    }
  }
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
