import { Controller, Get, ServiceUnavailableException } from "@nestjs/common";
import { InjectConnection } from "@nestjs/mongoose";
import { Connection } from "mongoose";

@Controller()
export class HealthController {
  constructor(@InjectConnection() private readonly connection: Connection) {}

  @Get()
  root() {
    return { name: "nexa-processor", status: "running", jobs: "/jobs", health: "/health" };
  }

  /** For the host's health check. 503 when the database is unreachable. */
  @Get("health")
  health() {
    const db = this.connection.readyState === 1;
    const body = { ok: db, db, uptimeSeconds: Math.round(process.uptime()) };
    if (!db) throw new ServiceUnavailableException(body);
    return body;
  }
}
