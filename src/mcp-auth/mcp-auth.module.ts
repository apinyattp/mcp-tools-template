import { Module } from "@nestjs/common";
import { McpOAuthStore } from "./mcp-oauth.store";
import { McpOAuthService } from "./mcp-oauth.service";
import { McpOAuthController } from "./mcp-oauth.controller";

@Module({
  controllers: [McpOAuthController],
  providers: [McpOAuthStore, McpOAuthService],
  exports: [McpOAuthService],
})
export class McpAuthModule {}
