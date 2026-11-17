import { Inject, Injectable, Logger } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import { JobRun, JobRunDocument, JobTrigger } from "../schemas/job-run.schema";
import { Job, JOBS } from "./job.interface";

const DEFAULT_TIMEOUT_MS = 5 * 60_000;

export type RunOutcome =
  | { status: "unknown" }
  | { status: "busy" }
  | { status: "done"; run: { ok: boolean; summary?: string; error?: string; durationMs: number } };

/** Runs jobs one at a time per job, with a timeout, and records every run in MongoDB. */
@Injectable()
export class JobRunnerService {
  private readonly logger = new Logger(JobRunnerService.name);
  private readonly running = new Set<string>();

  constructor(
    @Inject(JOBS) readonly jobs: Job[],
    @InjectModel(JobRun.name) private readonly runs: Model<JobRunDocument>,
  ) {}

  isRunning(name: string): boolean {
    return this.running.has(name);
  }

  find(name: string): Job | undefined {
    return this.jobs.find((j) => j.name === name);
  }

  /** The most recent recorded run of a job (survives restarts, because it lives in MongoDB). */
  lastRun(name: string) {
    return this.runs.findOne({ job: name }).sort({ startedAt: -1 }).lean();
  }

  async run(name: string, trigger: JobTrigger): Promise<RunOutcome> {
    const job = this.find(name);
    if (!job) return { status: "unknown" };
    // A job never overlaps itself: if the last run is still going, skip this one.
    if (this.running.has(name)) {
      this.logger.warn(`${name} is already running; skipped (${trigger})`);
      return { status: "busy" };
    }

    this.running.add(name);
    const startedAt = new Date();
    const record = await this.runs.create({ job: name, trigger, startedAt }).catch((err) => {
      // Not being able to write history must not stop the job itself.
      this.logger.error(`could not record start of ${name}: ${err.message}`);
      return null;
    });

    let ok = false;
    let summary: string | undefined;
    let error: string | undefined;
    this.logger.log(`${name} started (${trigger})`);

    try {
      summary = await this.withTimeout(job.run(), job.timeoutMs ?? DEFAULT_TIMEOUT_MS, name);
      ok = true;
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    } finally {
      this.running.delete(name);
    }

    const durationMs = Date.now() - startedAt.getTime();
    if (ok) this.logger.log(`${name} finished in ${durationMs} ms: ${summary}`);
    else this.logger.error(`${name} failed after ${durationMs} ms: ${error}`);

    await record
      ?.updateOne({ finishedAt: new Date(), durationMs, ok, summary, error })
      .catch((err) => this.logger.error(`could not record result of ${name}: ${err.message}`));

    return { status: "done", run: { ok, summary, error, durationMs } };
  }

  private withTimeout<T>(work: Promise<T>, ms: number, name: string): Promise<T> {
    let timer: NodeJS.Timeout;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error(`${name} timed out after ${Math.round(ms / 1000)} s`)), ms);
    });
    return Promise.race([work, timeout]).finally(() => clearTimeout(timer));
  }
}
