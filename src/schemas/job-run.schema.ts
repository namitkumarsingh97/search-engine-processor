import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument } from "mongoose";

export type JobTrigger = "schedule" | "startup" | "manual";

/** One execution of a job: the processor's own history, so you can see what ran and what failed. */
@Schema({ collection: "processorjobruns" })
export class JobRun {
  @Prop({ required: true, index: true }) job: string;
  @Prop({ required: true, enum: ["schedule", "startup", "manual"] }) trigger: JobTrigger;
  @Prop({ required: true, index: true }) startedAt: Date;
  @Prop() finishedAt?: Date;
  @Prop() durationMs?: number;
  @Prop() ok?: boolean;
  /** One line describing what the job did, e.g. "checked 5 repos, 2 new updates". */
  @Prop() summary?: string;
  @Prop() error?: string;
}
export type JobRunDocument = HydratedDocument<JobRun>;
export const JobRunSchema = SchemaFactory.createForClass(JobRun);
