import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { Document, Types } from "mongoose";

export enum BookingFrequency {
  ONE_TIME = "oneTime",
  WEEKLY = "weekly",
  BIWEEKLY = "biweekly",
  MONTHLY = "monthly",
}

export enum BookingSeriesStatus {
  ACTIVE = "active",
  PAUSED = "paused",
  CANCELLED = "cancelled",
}

/** Days between visits. Monthly is handled by calendar month, not this map. */
export const FREQUENCY_INTERVAL_DAYS: Record<string, number> = {
  [BookingFrequency.WEEKLY]: 7,
  [BookingFrequency.BIWEEKLY]: 14,
};

@Schema({ _id: false })
export class SeriesExtra {
  @Prop({ required: true })
  key: string;

  @Prop({ required: true, default: 0 })
  price: number;
}
const SeriesExtraSchema = SchemaFactory.createForClass(SeriesExtra);

/**
 * A recurring cleaning booking. The series holds the template; each visit is a
 * separate Job document carrying `seriesId`, so the existing job pipeline
 * (hiring, chat, payment, cancellation) works per visit without special cases.
 *
 * One-time bookings do not get a series - they stay plain Jobs.
 */
@Schema({ timestamps: true, collection: "booking_series" })
export class BookingSeries {
  @Prop({ type: Types.ObjectId, ref: "User", required: true, index: true })
  clientId: Types.ObjectId;

  @Prop({
    type: String,
    enum: Object.values(BookingFrequency),
    required: true,
  })
  frequency: BookingFrequency;

  @Prop({
    type: String,
    enum: Object.values(BookingSeriesStatus),
    default: BookingSeriesStatus.ACTIVE,
    index: true,
  })
  status: BookingSeriesStatus;

  /** CLEANING_TYPES key: home | deep | moveout | office */
  @Prop({ type: String, required: true })
  cleaningType: string;

  @Prop({ type: Number, required: true })
  hours: number;

  @Prop({ type: [SeriesExtraSchema], default: [] })
  extras: SeriesExtra[];

  /** Price of a single visit, after the recurring discount. */
  @Prop({ type: Number, required: true })
  visitPrice: number;

  @Prop({ type: String, required: true })
  startDate: string; // "2026-03-15"

  @Prop({ type: String, required: true })
  scheduledSlot: string; // "09:00-12:00"

  @Prop({ type: Object })
  address: Record<string, unknown>;

  @Prop({ type: String })
  location: string;

  @Prop({ type: String })
  notes: string;

  /** Preferred cleaner, carried onto each generated visit when set. */
  @Prop({ type: Types.ObjectId, ref: "User" })
  preferredProId: Types.ObjectId;

  /** Date of the furthest visit generated so far - the cron tops up from here. */
  @Prop({ type: String })
  generatedThrough: string;

  @Prop({ type: Date })
  cancelledAt: Date;

  @Prop({ type: String })
  cancellationReason: string;
}

export type BookingSeriesDocument = BookingSeries & Document;
export const BookingSeriesSchema =
  SchemaFactory.createForClass(BookingSeries);

BookingSeriesSchema.index({ clientId: 1, status: 1 });
