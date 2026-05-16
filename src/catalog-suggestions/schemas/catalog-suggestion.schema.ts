import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { Document, Types } from "mongoose";

/**
 * A suggestion from a pro to add a missing service to the catalog.
 *
 * Distinct from `service-requests` (which captures CLIENTS asking for work to
 * be done). This is PROS asking for the catalog to be expanded with a service
 * type they offer but can't currently list.
 *
 * Identity is auto-attached from the authenticated pro at create time -
 * pros never re-type their phone/name in the form. That keeps the request
 * trustworthy (we know who asked) and the form short.
 */

export type CatalogSuggestionStatus = "pending" | "approved" | "rejected";

export type CatalogSuggestionUnit =
  | "fixed"
  | "hourly"
  | "per_sqm"
  | "per_item"
  | "per_day"
  | "per_visit"
  | "byAgreement";

@Schema({ timestamps: true, collection: "catalog_suggestions" })
export class CatalogSuggestion extends Document {
  // What the pro wants added
  @Prop({ required: true, trim: true })
  serviceName: string;

  @Prop({ required: true, trim: true })
  description: string;

  // Optional hints for admin review
  @Prop({ index: true })
  suggestedCategoryKey?: string;

  @Prop()
  suggestedPrice?: number;

  @Prop()
  suggestedUnit?: CatalogSuggestionUnit;

  @Prop()
  photoUrl?: string;

  // Auto-attached from the authenticated user at create time
  @Prop({ type: Types.ObjectId, ref: "User", required: true, index: true })
  requestedByUserId: Types.ObjectId;

  @Prop({ required: true })
  requestedByName: string;

  @Prop({ required: true, index: true })
  requestedByPhone: string;

  @Prop()
  requestedByEmail?: string;

  // The pro's UID (numeric) for easier admin lookup
  @Prop({ index: true })
  requestedByUid?: number;

  // Locale they were on when submitting - useful for review context
  @Prop()
  locale?: string;

  // Admin review state
  @Prop({
    required: true,
    enum: ["pending", "approved", "rejected"],
    default: "pending",
    index: true,
  })
  status: CatalogSuggestionStatus;

  @Prop()
  reviewerNote?: string;

  @Prop({ type: Types.ObjectId, ref: "User" })
  reviewedByUserId?: Types.ObjectId;

  @Prop()
  reviewedAt?: Date;
}

export const CatalogSuggestionSchema =
  SchemaFactory.createForClass(CatalogSuggestion);

/**
 * Plain-object shape returned by `.lean()` queries. Mirrors the schema fields
 * without the Document inheritance noise. Use this as the generic when calling
 * `.lean<CatalogSuggestionDoc[]>()` so we get a clean typed result instead of
 * mongoose's ceremonial wrapper types.
 */
export interface CatalogSuggestionDoc {
  _id: Types.ObjectId;
  serviceName: string;
  description: string;
  suggestedCategoryKey?: string;
  suggestedPrice?: number;
  suggestedUnit?: CatalogSuggestionUnit;
  photoUrl?: string;
  requestedByUserId: Types.ObjectId;
  requestedByName: string;
  requestedByPhone: string;
  requestedByEmail?: string;
  requestedByUid?: number;
  locale?: string;
  status: CatalogSuggestionStatus;
  reviewerNote?: string;
  reviewedByUserId?: Types.ObjectId;
  reviewedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}
