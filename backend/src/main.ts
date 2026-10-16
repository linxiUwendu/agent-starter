import { ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { ConfigService } from "@nestjs/config";

import { AppModule } from "./app.module";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
    }),
  );

  const config = app.get(ConfigService);
  const port = Number(config.get<string>("PORT") ?? 3000);
  const host = config.get<string>("HOST") ?? "127.0.0.1";
  const mockAgent = config.get<string>("MOCK_AGENT") === "true";
  const ragProvider = config.get<string>("RAG_EMBEDDING_PROVIDER") ?? "tfidf";

  try {
    await app.listen(port, host);
  } catch (error) {
    const err = error as NodeJS.ErrnoException;
    if (err.code === "EADDRINUSE") {
      console.error(
        `[agent-starter] PORT ${port} already in use. Stop the other process (lsof -i :${port}) or change PORT in .env.`,
      );
    }
    throw error;
  }

  const useApiKey = config.get<string>("CURSOR_USE_API_KEY") === "true";
  console.log(`[agent-starter] running at http://${host}:${port}`);
  console.log(`[agent-starter] mock agent: ${mockAgent}`);
  console.log(`[agent-starter] RAG embedding: ${ragProvider}`);
  console.log(`[agent-starter] auth mode: ${useApiKey ? "api-key" : "cli-login"}`);
  if (!useApiKey) {
    console.log("[agent-starter] Run `cursor-agent login` or set CURSOR_USE_API_KEY=true with a valid key.");
  }
}

void bootstrap();
