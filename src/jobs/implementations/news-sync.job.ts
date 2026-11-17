import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import { AppConfig } from "../../config/configuration";
import { AppEntry, AppEntryDocument, Meta, MetaDocument, NewsItem, NewsItemDocument } from "../../schemas/shared.schemas";
import { Job } from "../job.interface";

const DAY_MS = 86_400_000;
/** How far back the very first sync looks: news is "recent changes", not a full history. */
const BACKFILL_DAYS = 90;
const MAX_PER_REPO = 30;

interface GithubCommit {
  sha: string;
  html_url: string;
  parents?: unknown[];
  commit: { message: string; author?: { date?: string } | null; committer?: { date?: string } | null };
  author?: { login?: string; type?: string } | null;
}

/** Merge commits, bots and one-word messages say nothing useful to a reader. */
function isNoise(c: GithubCommit): boolean {
  const subject = c.commit.message.split("\n")[0].trim();
  if ((c.parents?.length ?? 0) > 1) return true;
  if (/^merge\b/i.test(subject)) return true;
  if (c.author?.type === "Bot" || c.author?.login?.endsWith("[bot]")) return true;
  if (subject.length < 8) return true;
  return /^(wip|update|updates|fix|fixes|changes|commit|initial commit|test|tests)$/i.test(subject);
}

/** Splits a commit message into headline and rest, dropping "Co-Authored-By"-style trailers. */
function splitMessage(raw: string): { message: string; body: string } {
  const [first, ...rest] = raw.split("\n");
  const body = rest
    .filter((l) => !/^\s*(co-authored-by|signed-off-by|generated with)/i.test(l))
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
  return { message: first.trim().slice(0, 140), body: body.slice(0, 500) };
}

/**
 * Reads new commits from each product's public GitHub repos into the shared `newsitems`
 * collection, then stamps `news_last_sync` so the API knows to reload its search index.
 */
@Injectable()
export class NewsSyncJob implements Job {
  readonly name = "news-sync";
  readonly description = "Reads new commits from each product's public GitHub repos and stores them as news.";
  readonly defaultCron = "0 */3 * * *"; // every 3 hours: news is not a live feed
  readonly timeoutMs = 3 * 60_000;

  private readonly logger = new Logger(NewsSyncJob.name);

  constructor(
    @InjectModel(AppEntry.name) private readonly apps: Model<AppEntryDocument>,
    @InjectModel(NewsItem.name) private readonly news: Model<NewsItemDocument>,
    @InjectModel(Meta.name) private readonly meta: Model<MetaDocument>,
    private readonly config: ConfigService,
  ) {}

  async run(): Promise<string> {
    const apps = await this.apps.find({ visible: true, "repos.0": { $exists: true } });
    let repos = 0;
    let added = 0;
    const errors: string[] = [];

    for (const app of apps) {
      for (const repo of app.repos) {
        repos++;
        try {
          added += await this.syncRepo(app.slug, repo);
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          errors.push(message);
          this.logger.warn(message);
        }
      }
    }

    // Stamped even when some repos failed: the API compares this value to decide whether to reload news.
    await this.meta.updateOne({ key: "news_last_sync" }, { $set: { value: String(Date.now()) } }, { upsert: true });

    // Every repo failing is a real problem (bad token, GitHub down): fail the run so it shows up in /jobs.
    if (repos > 0 && errors.length === repos) throw new Error(`all ${repos} repos failed: ${errors[0]}`);
    const problems = errors.length ? `, ${errors.length} problem${errors.length === 1 ? "" : "s"} (${errors[0]})` : "";
    return `checked ${repos} repo${repos === 1 ? "" : "s"}, ${added} new update${added === 1 ? "" : "s"}${problems}`;
  }

  private async syncRepo(appSlug: string, repo: string): Promise<number> {
    const latest = await this.news.findOne({ repo }).sort({ committedAt: -1 });
    // Re-read from just before the newest stored commit so nothing is missed at the boundary.
    const since = latest ? new Date(latest.committedAt.getTime() - 60_000) : new Date(Date.now() - BACKFILL_DAYS * DAY_MS);

    let added = 0;
    for (const c of (await this.fetchCommits(repo, since)).filter((x) => !isNoise(x))) {
      const { message, body } = splitMessage(c.commit.message);
      const when = c.commit.committer?.date ?? c.commit.author?.date;
      if (!message || !when) continue;

      const res = await this.news.updateOne(
        { repo, sha: c.sha },
        { $setOnInsert: { appSlug, repo, sha: c.sha, message, body, url: c.html_url, committedAt: new Date(when), hidden: false } },
        { upsert: true },
      );
      if (res.upsertedCount > 0) added++;
    }
    return added;
  }

  private async fetchCommits(repo: string, since: Date): Promise<GithubCommit[]> {
    const headers: Record<string, string> = { Accept: "application/vnd.github+json", "User-Agent": "Nexa-Processor" };
    const token = this.config.get<AppConfig>("app")!.githubToken;
    if (token) headers.Authorization = `Bearer ${token}`;

    const url = `https://api.github.com/repos/${repo}/commits?per_page=${MAX_PER_REPO}&since=${encodeURIComponent(since.toISOString())}`;
    const res = await fetch(url, { headers, signal: AbortSignal.timeout(10_000) });
    // 404 = missing or private repo, 409 = empty repo: nothing to show, not an error.
    if (res.status === 404 || res.status === 409) return [];
    if (!res.ok) throw new Error(`GitHub answered ${res.status} for ${repo}`);
    return (await res.json()) as GithubCommit[];
  }
}
