import { Injectable } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import { JobRun, JobRunDocument } from "../../schemas/job-run.schema";
import { Job } from "../job.interface";

const KEEP_DAYS = 30;

/** Housekeeping: the processor's own run history would otherwise grow forever. */
@Injectable()
export class PruneJobRunsJob implements Job {
  readonly name = "prune-job-runs";
  readonly description = `Deletes this processor's run history older than ${KEEP_DAYS} days.`;
  readonly defaultCron = "30 3 * * *"; // 03:30 every day

  constructor(@InjectModel(JobRun.name) private readonly runs: Model<JobRunDocument>) {}

  async run(): Promise<string> {
    const cutoff = new Date(Date.now() - KEEP_DAYS * 86_400_000);
    const result = await this.runs.deleteMany({ startedAt: { $lt: cutoff } });
    return `removed ${result.deletedCount} run record${result.deletedCount === 1 ? "" : "s"} older than ${KEEP_DAYS} days`;
  }
}
