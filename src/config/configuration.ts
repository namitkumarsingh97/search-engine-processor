/** Everything the processor reads from the environment, typed, in one place. */
export interface AppConfig {
  mongoUri: string;
  port: number;
  /** Guards POST /jobs/:name/run. Empty means that endpoint is switched off. */
  secret: string;
  githubToken: string;
  timezone: string;
  runJobsOnStart: boolean;
}

export default (): { app: AppConfig } => ({
  app: {
    mongoUri: process.env.MONGODB_URI ?? "",
    port: Number(process.env.PORT ?? 4100),
    secret: process.env.PROCESSOR_SECRET ?? "",
    githubToken: process.env.GITHUB_TOKEN ?? "",
    timezone: process.env.CRON_TIMEZONE ?? "UTC",
    runJobsOnStart: (process.env.RUN_JOBS_ON_START ?? "1") !== "0",
  },
});

/** Stops the app at boot with a readable message when a required setting is missing. */
export function validateEnv(env: Record<string, unknown>): Record<string, unknown> {
  if (!env.MONGODB_URI) {
    throw new Error("MONGODB_URI is not set. Copy .env.example to .env and fill it in (or set it in your host's environment variables).");
  }
  return env;
}

/** "news-sync" -> "NEWS_SYNC", used to build per-job env names like JOB_NEWS_SYNC_CRON. */
const envKey = (jobName: string) => jobName.toUpperCase().replace(/[^A-Z0-9]+/g, "_");

export const jobCronOverride = (jobName: string): string | undefined => process.env[`JOB_${envKey(jobName)}_CRON`] || undefined;
export const jobEnabled = (jobName: string): boolean => (process.env[`JOB_${envKey(jobName)}_ENABLED`] ?? "1") !== "0";
