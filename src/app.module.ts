import { Module } from "@nestjs/common";
import { McpController } from "./mcp.controller";
import { McpAuthModule } from "./mcp-auth/mcp-auth.module";

@Module({
  imports: [McpAuthModule],
  controllers: [McpController],
})
export class AppModule {}
