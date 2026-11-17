import "dotenv/config";
import type { NestExpressApplication } from "@nestjs/platform-express";
import type { AppConfig } from "./config/configuration";

async function bootstrap() {
  // Checked before Nest loads, so a missing setting gives one clear line instead of a stack trace.
  if (!process.env.MONGODB_URI) {
    console.error("[processor] MONGODB_URI is not set. Copy .env.example to .env and fill it in (or set it in your host's environment variables).");
    process.exit(1);
  }

  // Loaded only now, because importing the app module reads the environment.
  const { Logger } = await import("@nestjs/common");
  const { ConfigService } = await import("@nestjs/config");
  const { NestFactory } = await import("@nestjs/core");
  const { AppModule } = await import("./app.module");

  const app = await NestFactory.create<NestExpressApplication>(AppModule, { logger: ["log", "warn", "error"] });
  app.disable("x-powered-by");
  // Lets Ctrl+C / the host's stop signal stop schedules and close the database cleanly.
  app.enableShutdownHooks();

  const { port } = app.get(ConfigService).get<AppConfig>("app")!;
  await app.listen(port, "0.0.0.0");
  new Logger("Processor").log(`listening on port ${port}`);
}

bootstrap().catch((err) => {
  console.error("[processor] failed to start:", err instanceof Error ? err.message : err);
  process.exit(1);
});

// A stray rejection inside one job must not take the whole worker down.
process.on("unhandledRejection", (reason) => console.error("[processor] unhandled rejection:", reason));
