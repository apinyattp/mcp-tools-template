import { Injectable } from "@nestjs/common";

export interface OAuthClient {
  client_id: string;
  client_secret?: string;
  client_name?: string;
  redirect_uris: string[];
  grant_types: string[];
  response_types: string[];
  token_endpoint_auth_method: string;
  scope?: string;
  created_at: number;
}

export interface AuthorizationCode {
  code: string;
  client_id: string;
  redirect_uri: string;
  code_challenge: string;
  code_challenge_method: "S256";
  scope: string;
  expires_at: number;
  used: boolean;
}

export interface AccessToken {
  token: string;
  client_id: string;
  scope: string;
  expires_at: number;
  created_at: number;
}

@Injectable()
export class McpOAuthStore {
  private clients = new Map<string, OAuthClient>();
  private authCodes = new Map<string, AuthorizationCode>();
  private accessTokens = new Map<string, AccessToken>();

  saveClient(client: OAuthClient): void {
    this.clients.set(client.client_id, client);
  }

  getClient(clientId: string): OAuthClient | undefined {
    return this.clients.get(clientId);
  }

  saveAuthCode(code: AuthorizationCode): void {
    this.authCodes.set(code.code, code);
  }

  getAuthCode(code: string): AuthorizationCode | undefined {
    return this.authCodes.get(code);
  }

  markAuthCodeUsed(code: string): void {
    const ac = this.authCodes.get(code);
    if (ac) ac.used = true;
  }

  saveAccessToken(token: AccessToken): void {
    this.accessTokens.set(token.token, token);
  }

  getAccessToken(token: string): AccessToken | undefined {
    return this.accessTokens.get(token);
  }

  isTokenValid(token: string): boolean {
    const t = this.accessTokens.get(token);
    if (!t) return false;
    return Date.now() < t.expires_at;
  }
}
