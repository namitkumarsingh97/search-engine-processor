import { Injectable, Logger, OnApplicationBootstrap, OnApplicationShutdown } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { SchedulerRegistry } from "@nestjs/schedule";
import { CronJob } from "cron";
import { AppConfig, jobCronOverride, jobEnabled } from "../config/configuration";
import { Job } from "./job.interface";
import { JobRunnerService } from "./job-runner.service";

export interface ScheduleInfo {
  enabled: boolean;
  cron: string;
  timezone: string;
  nextRunAt: string | null;
  /** Set when the cron expression was invalid, so the job is not scheduled. */
  problem?: string;
}

/** Turns each job's cron expression into a running schedule when the app starts. */
@Injectable()
export class JobSchedulerService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(JobSchedulerService.name);
  private readonly info = new Map<string, ScheduleInfo>();
  private readonly crons = new Map<string, CronJob>();
  private readonly startupTimers: NodeJS.Timeout[] = [];

  constructor(
    private readonly runner: JobRunnerService,
    private readonly registry: SchedulerRegistry,
    private readonly config: ConfigService,
  ) {}

  onApplicationBootstrap(): void {
    const { timezone, runJobsOnStart } = this.config.get<AppConfig>("app")!;

    this.runner.jobs.forEach((job, index) => {
      const cron = jobCronOverride(job.name) ?? job.defaultCron;
      const base = { cron, timezone, nextRunAt: null as string | null };

      if (!jobEnabled(job.name)) {
        this.info.set(job.name, { ...base, enabled: false });
        this.logger.log(`${job.name} is disabled (JOB_..._ENABLED=0)`);
        return;
      }

      try {
        // A bad expression disables only this job, never the whole processor.
        const cronJob = new CronJob(cron, () => void this.runner.run(job.name, "schedule"), null, false, timezone);
        this.registry.addCronJob(job.name, cronJob);
        cronJob.start();
        this.crons.set(job.name, cronJob);
        this.info.set(job.name, { ...base, enabled: true });
        this.logger.log(`${job.name} scheduled "${cron}" (${timezone}); next run ${this.nextRun(job.name)}`);
      } catch (err) {
        const problem = `invalid cron expression "${cron}"`;
        this.info.set(job.name, { ...base, enabled: false, problem });
        this.logger.error(`${job.name}: ${problem}; not scheduled`);
        return;
      }

      if (runJobsOnStart) this.runOnStart(job, index);
    });
  }

  /** Staggered, so jobs don't all hit the database and GitHub at the same instant. */
  private runOnStart(job: Job, index: number): void {
    const timer = setTimeout(() => void this.runner.run(job.name, "startup"), 2000 + index * 3000);
    this.startupTimers.push(timer);
  }

  nextRun(name: string): string | null {
    try {
      return this.crons.get(name)?.nextDate().toJSDate().toISOString() ?? null;
    } catch {
      return null;
    }
  }

  describe(name: string): ScheduleInfo | undefined {
    const info = this.info.get(name);
    return info && { ...info, nextRunAt: this.nextRun(name) };
  }

  onApplicationShutdown(): void {
    this.startupTimers.forEach(clearTimeout);
    this.crons.forEach((c) => c.stop());
  }
}
