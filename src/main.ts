import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import helmet from "helmet";
import { AppModule } from "./app.module";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // MCP + OAuth endpoints have no prefix
  app.setGlobalPrefix("api/v1", {
    exclude: [
      "mcp",
      ".well-known/oauth-protected-resource",
      ".well-known/oauth-authorization-server",
      "oauth/register",
      "oauth/authorize",
      "oauth/token",
    ],
  });

  // CORS
  const corsOrigins = process.env.CORS_ORIGINS?.split(",") || ["*"];
  app.enableCors({
    origin: corsOrigins,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "Mcp-Session-Id"],
    exposedHeaders: ["Mcp-Session-Id"],
    credentials: true,
  });

  // Security
  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: "cross-origin" },
    }),
  );

  const port = parseInt(process.env.PORT ?? "3000", 10);
  await app.listen(port, "0.0.0.0");

  console.log(`MCP Server listening on http://0.0.0.0:${port}`);
  console.log(`MCP endpoint: http://localhost:${port}/mcp`);
}

bootstrap();
