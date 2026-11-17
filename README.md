# Nexa Processor

An always-on **NestJS** worker for [Nexa](../search-engine-api). It runs scheduled jobs in the background so the API and UI stay fast. It shares Nexa's MongoDB, so the API and UI need no link to it.

```
                     ┌──────────────────────┐
  GitHub (commits) ─▶│   Nexa Processor     │──┐   writes news, history
                     │  NestJS + cron jobs  │  │
                     └──────────────────────┘  ▼
                                          ┌─────────┐        ┌────────┐      ┌────────┐
                                          │ MongoDB │◀──────▶│  API   │◀────▶│   UI   │
                                          └─────────┘ reads  └────────┘      └────────┘
```

## Jobs

| Job | Default schedule | What it does |
| --- | --- | --- |
| `news-sync` | every 3 hours (`0 */3 * * *`) | Reads new commits from each product's public GitHub repos into the `newsitems` collection, then stamps `news_last_sync` so the API reloads its search index. |
| `prune-job-runs` | daily 03:30 (`30 3 * * *`) | Deletes this processor's own run history older than 30 days. |

Every run is recorded in MongoDB (`processorjobruns`): when it started, how long it took, a one-line summary, or the error. A job never overlaps itself, and a run that takes too long is stopped and recorded as failed. A bad cron expression disables only that job, never the whole worker.

## Run it

```bash
npm install
cp .env.example .env     # then fill in MONGODB_URI (and PROCESSOR_SECRET)
npm run dev              # watch mode
# or
npm run build && npm start
```

It listens on `PORT` (default 4100).

## Settings (environment variables)

| Variable | Needed | Description |
| --- | --- | --- |
| `MONGODB_URI` | yes | The **same** database the Nexa API uses. |
| `PROCESSOR_SECRET` | recommended | Protects `POST /jobs/:name/run`. Unset = manual runs are off (503). |
| `GITHUB_TOKEN` | optional | Read-only token, no scopes needed for public repos. Raises GitHub's limit from 60 to 5,000 requests/hour. |
| `PORT` | optional | Default 4100. Hosts like Render and Railway set it for you. |
| `CRON_TIMEZONE` | optional | IANA timezone the schedules are read in, e.g. `Asia/Kolkata`. Default `UTC`. |
| `RUN_JOBS_ON_START` | optional | `1` (default) runs every enabled job once shortly after start-up; `0` waits for the schedule. |
| `JOB_<NAME>_CRON` | optional | Override a job's schedule, e.g. `JOB_NEWS_SYNC_CRON=0 */6 * * *`. |
| `JOB_<NAME>_ENABLED` | optional | `0` switches a job off, e.g. `JOB_PRUNE_JOB_RUNS_ENABLED=0`. |

`<NAME>` is the job name in capitals with dashes as underscores (`news-sync` → `NEWS_SYNC`).

**Never put real secrets in `.env.example`** (it is committed). Put them in `.env`, which is git-ignored, or in your host's environment settings.

## Endpoints

| Method | Path | Auth | Description |
| --- | --- | --- | --- |
| `GET` | `/health` | none | `{ ok, db, uptimeSeconds }`. `503` if MongoDB is unreachable. Use it for the host's health check. |
| `GET` | `/jobs` | none | Every job with its schedule, next run, whether it is running, and the outcome of its last run. |
| `POST` | `/jobs/:name/run` | `Authorization: Bearer <PROCESSOR_SECRET>` | Run a job now and wait for the result. `404` unknown job, `409` already running, `401` bad token. |

```bash
curl -X POST https://YOUR-PROCESSOR/jobs/news-sync/run -H "Authorization: Bearer $PROCESSOR_SECRET"
```

## Add a job

1. Create `src/jobs/implementations/my-thing.job.ts` implementing `Job` (`name`, `description`, `defaultCron`, `run()` that returns a one-line summary):

   ```ts
   @Injectable()
   export class MyThingJob implements Job {
     readonly name = "my-thing";
     readonly description = "What it does.";
     readonly defaultCron = "*/30 * * * *";
     async run() { /* do the work */ return "did 3 things"; }
   }
   ```
2. Register it in `src/jobs/jobs.module.ts`: add the class to `providers` and to the `inject` list of the `JOBS` provider.
3. That's it: it is scheduled, runs at start-up, shows in `/jobs`, can be triggered with `POST /jobs/my-thing/run`, and is configurable with `JOB_MY_THING_CRON` / `JOB_MY_THING_ENABLED`.

Ideas that fit here later: crawling on a schedule, video thumbnails, text extraction for uploads, calendar and mail reminders, cleaning expired share links, nightly index health checks.

## Connect it to the API

On the **API** project set `NEWS_SYNC_EXTERNAL=1`. The API then stops syncing GitHub itself; it only reloads its in-memory search index when the processor has stored new news (checked at most once a minute, `NEWS_INDEX_CHECK_SECONDS` to change). Nothing needs to be configured on the UI.

## Deploy

This must run on a host that keeps the process alive, so **not Vercel** (serverless functions can't hold timers). Render, Railway, Fly.io or a small VPS all work.

- **Build command:** `npm install && npm run build`
- **Start command:** `npm start`
- **Health check path:** `/health`
- **Environment:** `MONGODB_URI`, `PROCESSOR_SECRET`, optionally `GITHUB_TOKEN`, `CRON_TIMEZONE`.

Free plans on some hosts put the service to sleep when idle, and a sleeping worker misses its schedule. Either use an always-on plan, or ping `/health` every ~10 minutes from a free uptime monitor.

MongoDB Atlas must allow the host's address in Network Access (`0.0.0.0/0` is the simplest).

## Notes

- `src/schemas/shared.schemas.ts` repeats the few Mongoose schemas the API owns (`appentries`, `newsitems`, `metas`). Keep them in step with `search-engine-api`. Index creation is switched off here (`autoIndex: false`); the API owns the indexes.
- Logs never print the MongoDB connection string, only the host and database name.
