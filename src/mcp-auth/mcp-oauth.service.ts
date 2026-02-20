import { Injectable, Inject, BadRequestException } from "@nestjs/common";
import { createHash, randomUUID } from "crypto";
import {
  McpOAuthStore,
  type OAuthClient,
  type AccessToken,
} from "./mcp-oauth.store";

// Pre-registered client credentials for Claude connector (from env)
export const DEFAULT_CLIENT_ID =
  process.env.MCP_OAUTH_CLIENT_ID ?? "mcp-client";
export const DEFAULT_CLIENT_SECRET =
  process.env.MCP_OAUTH_CLIENT_SECRET ?? "mcp-secret-change-in-production";

@Injectable()
export class McpOAuthService {
  constructor(
    @Inject(McpOAuthStore) private store: McpOAuthStore,
  ) {
    // Pre-register default client so Claude can use a known client_id/secret
    this.store.saveClient({
      client_id: DEFAULT_CLIENT_ID,
      client_secret: DEFAULT_CLIENT_SECRET,
      client_name: "MCP Client",
      redirect_uris: [],
      grant_types: ["authorization_code"],
      response_types: ["code"],
      token_endpoint_auth_method: "client_secret_post",
      created_at: Date.now(),
    });
  }

  registerClient(body: {
    client_name?: string;
    redirect_uris?: string[];
    grant_types?: string[];
    response_types?: string[];
    token_endpoint_auth_method?: string;
    scope?: string;
  }): OAuthClient {
    if (
      !body.redirect_uris ||
      !Array.isArray(body.redirect_uris) ||
      body.redirect_uris.length === 0
    ) {
      throw new BadRequestException("redirect_uris is required");
    }

    const client: OAuthClient = {
      client_id: randomUUID(),
      client_secret: randomUUID(),
      client_name: body.client_name,
      redirect_uris: body.redirect_uris,
      grant_types: body.grant_types ?? ["authorization_code"],
      response_types: body.response_types ?? ["code"],
      token_endpoint_auth_method:
        body.token_endpoint_auth_method ?? "none",
      scope: body.scope,
      created_at: Date.now(),
    };

    this.store.saveClient(client);
    return client;
  }

  createAuthorizationCode(params: {
    client_id: string;
    redirect_uri: string;
    code_challenge: string;
    code_challenge_method: string;
    scope?: string;
    state?: string;
  }): { code: string; redirect_uri: string; state?: string } {
    const client = this.store.getClient(params.client_id);
    if (!client) {
      throw new BadRequestException("Unknown client_id");
    }

    if (
      client.redirect_uris.length > 0 &&
      !client.redirect_uris.includes(params.redirect_uri)
    ) {
      throw new BadRequestException("Invalid redirect_uri");
    }

    if (params.code_challenge_method !== "S256") {
      throw new BadRequestException(
        "Only S256 code_challenge_method is supported",
      );
    }

    const code = randomUUID();
    this.store.saveAuthCode({
      code,
      client_id: params.client_id,
      redirect_uri: params.redirect_uri,
      code_challenge: params.code_challenge,
      code_challenge_method: "S256",
      scope: params.scope ?? "mcp:tools",
      expires_at: Date.now() + 10 * 60 * 1000,
      used: false,
    });

    return { code, redirect_uri: params.redirect_uri, state: params.state };
  }

  exchangeCodeForToken(body: {
    grant_type: string;
    code: string;
    redirect_uri: string;
    client_id: string;
    client_secret?: string;
    code_verifier: string;
  }): {
    access_token: string;
    token_type: "Bearer";
    expires_in: number;
    scope: string;
  } {
    if (body.grant_type !== "authorization_code") {
      throw new BadRequestException(
        "Unsupported grant_type. Use authorization_code",
      );
    }

    const authCode = this.store.getAuthCode(body.code);
    if (!authCode) {
      throw new BadRequestException("Invalid authorization code");
    }

    if (authCode.used) {
      throw new BadRequestException("Authorization code already used");
    }

    if (Date.now() > authCode.expires_at) {
      throw new BadRequestException("Authorization code expired");
    }

    if (authCode.client_id !== body.client_id) {
      throw new BadRequestException("client_id mismatch");
    }

    const client = this.store.getClient(body.client_id);
    if (client?.client_secret && client.client_secret !== body.client_secret) {
      throw new BadRequestException("Invalid client_secret");
    }

    if (authCode.redirect_uri !== body.redirect_uri) {
      throw new BadRequestException("redirect_uri mismatch");
    }

    if (!this.verifyPkce(body.code_verifier, authCode.code_challenge)) {
      throw new BadRequestException("PKCE verification failed");
    }

    this.store.markAuthCodeUsed(body.code);

    const expiresIn = 3600;
    const token: AccessToken = {
      token: randomUUID(),
      client_id: body.client_id,
      scope: authCode.scope,
      expires_at: Date.now() + expiresIn * 1000,
      created_at: Date.now(),
    };

    this.store.saveAccessToken(token);

    return {
      access_token: token.token,
      token_type: "Bearer",
      expires_in: expiresIn,
      scope: token.scope,
    };
  }

  validateAccessToken(token: string): AccessToken | null {
    if (!this.store.isTokenValid(token)) return null;
    return this.store.getAccessToken(token) ?? null;
  }

  buildProtectedResourceMetadata(baseUrl: string): object {
    return {
      resource: baseUrl,
      authorization_servers: [baseUrl],
      scopes_supported: ["mcp:tools"],
      bearer_methods_supported: ["header"],
      resource_name: "MCP Server",
    };
  }

  buildAuthServerMetadata(baseUrl: string): object {
    return {
      issuer: baseUrl,
      authorization_endpoint: `${baseUrl}/oauth/authorize`,
      token_endpoint: `${baseUrl}/oauth/token`,
      registration_endpoint: `${baseUrl}/oauth/register`,
      response_types_supported: ["code"],
      grant_types_supported: ["authorization_code"],
      code_challenge_methods_supported: ["S256"],
      token_endpoint_auth_methods_supported: ["client_secret_post", "none"],
      scopes_supported: ["mcp:tools"],
    };
  }

  private verifyPkce(
    codeVerifier: string,
    codeChallenge: string,
  ): boolean {
    const hash = createHash("sha256")
      .update(codeVerifier)
      .digest("base64url");
    return hash === codeChallenge;
  }
}
