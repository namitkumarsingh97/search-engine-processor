import { Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import { JobRun, JobRunSchema } from "../schemas/job-run.schema";
import { AppEntry, AppEntrySchema, Meta, MetaSchema, NewsItem, NewsItemSchema } from "../schemas/shared.schemas";
import { NewsSyncJob } from "./implementations/news-sync.job";
import { PruneJobRunsJob } from "./implementations/prune-job-runs.job";
import { Job, JOBS } from "./job.interface";
import { JobRunnerService } from "./job-runner.service";
import { JobSchedulerService } from "./job-scheduler.service";
import { JobsController } from "./jobs.controller";
import { SecretGuard } from "./secret.guard";

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: JobRun.name, schema: JobRunSchema },
      { name: AppEntry.name, schema: AppEntrySchema },
      { name: NewsItem.name, schema: NewsItemSchema },
      { name: Meta.name, schema: MetaSchema },
    ]),
  ],
  controllers: [JobsController],
  providers: [
    NewsSyncJob,
    PruneJobRunsJob,
    // The list of every job. Add a new job's class here (and to `providers` above).
    {
      provide: JOBS,
      useFactory: (...jobs: Job[]) => jobs,
      inject: [NewsSyncJob, PruneJobRunsJob],
    },
    JobRunnerService,
    JobSchedulerService,
    SecretGuard,
  ],
})
export class JobsModule {}
