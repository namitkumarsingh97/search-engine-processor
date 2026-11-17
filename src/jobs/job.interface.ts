/**
 * A scheduled unit of work. To add one: implement this, register the class as a
 * provider in jobs.module.ts and add it to the JOBS list there.
 */
export interface Job {
  /** Unique, lowercase with dashes. Used in the URL (POST /jobs/<name>/run) and for env overrides. */
  readonly name: string;
  readonly description: string;
  /** Cron expression used unless JOB_<NAME>_CRON overrides it. */
  readonly defaultCron: string;
  /** A run longer than this is recorded as failed. Default 5 minutes. */
  readonly timeoutMs?: number;
  /** Does the work and returns a one-line summary of what happened. Throw to mark the run as failed. */
  run(): Promise<string>;
}

/** Injection token for the list of all jobs. */
export const JOBS = "PROCESSOR_JOBS";
