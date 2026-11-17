import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument } from "mongoose";

/**
 * Schemas for collections the Nexa API owns. They keep the SAME model names and
 * collection names (appentries, newsitems, metas) and compatible fields.
 * autoIndex is off: the API creates the indexes; the processor only reads and
 * writes documents.
 *
 * If you change these in search-engine-api, change them here too.
 */

@Schema({ collection: "appentries", autoIndex: false })
export class AppEntry {
  @Prop() slug: string;
  @Prop() name: string;
  @Prop() visible: boolean;
  /** Public GitHub repos ("owner/name") whose commits become the product's news. */
  @Prop({ type: [String], default: [] }) repos: string[];
}
export type AppEntryDocument = HydratedDocument<AppEntry>;
export const AppEntrySchema = SchemaFactory.createForClass(AppEntry);

@Schema({ collection: "newsitems", autoIndex: false })
export class NewsItem {
  @Prop({ required: true }) appSlug: string;
  @Prop({ required: true }) repo: string;
  @Prop({ required: true }) sha: string;
  @Prop({ required: true }) message: string;
  @Prop({ default: "" }) body: string;
  @Prop({ required: true }) url: string;
  @Prop({ required: true }) committedAt: Date;
  @Prop({ default: false }) hidden: boolean;
}
export type NewsItemDocument = HydratedDocument<NewsItem>;
export const NewsItemSchema = SchemaFactory.createForClass(NewsItem);

@Schema({ collection: "metas", autoIndex: false })
export class Meta {
  @Prop({ required: true }) key: string;
  @Prop() value: string;
}
export type MetaDocument = HydratedDocument<Meta>;
export const MetaSchema = SchemaFactory.createForClass(Meta);
