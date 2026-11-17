import { Controller, ConflictException, Get, HttpCode, NotFoundException, Param, Post, UseGuards } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { AppConfig } from "../config/configuration";
import { JobRunnerService } from "./job-runner.service";
import { JobSchedulerService } from "./job-scheduler.service";
import { SecretGuard } from "./secret.guard";

@Controller("jobs")
export class JobsController {
  constructor(
    private readonly runner: JobRunnerService,
    private readonly scheduler: JobSchedulerService,
    private readonly config: ConfigService,
  ) {}

  /** Every job with its schedule, whether it is running, and the outcome of its last run. */
  @Get()
  async list() {
    const { timezone } = this.config.get<AppConfig>("app")!;
    return Promise.all(
      this.runner.jobs.map(async (job) => {
        const last = await this.runner.lastRun(job.name);
        return {
          name: job.name,
          description: job.description,
          schedule: this.scheduler.describe(job.name) ?? { enabled: false, cron: job.defaultCron, timezone, nextRunAt: null },
          running: this.runner.isRunning(job.name),
          lastRun: last && {
            trigger: last.trigger,
            startedAt: last.startedAt,
            finishedAt: last.finishedAt ?? null,
            durationMs: last.durationMs ?? null,
            ok: last.ok ?? null,
            summary: last.summary ?? null,
            error: last.error ?? null,
          },
        };
      }),
    );
  }

  /** Runs a job right now and waits for it to finish. Needs the processor secret. */
  @Post(":name/run")
  @HttpCode(200)
  @UseGuards(SecretGuard)
  async runNow(@Param("name") name: string) {
    const outcome = await this.runner.run(name, "manual");
    if (outcome.status === "unknown") throw new NotFoundException(`No job called "${name}".`);
    if (outcome.status === "busy") throw new ConflictException(`"${name}" is already running.`);
    return { job: name, ...outcome.run };
  }
}
