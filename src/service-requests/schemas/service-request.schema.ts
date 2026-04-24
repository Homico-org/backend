import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { Document } from "mongoose";

export type ServiceRequestStatus =
  | "new"
  | "contacted"
  | "quoted"
  | "booked"
  | "dropped";

export type ServiceRequestTiming = "asap" | "this_week" | "flexible";

@Schema({ timestamps: true })
export class ServiceRequest extends Document {
  // What the client wants (V3 catalog keys when available)
  @Prop({ required: true, index: true })
  category: string;

  @Prop({ index: true })
  subcategory?: string;

  @Prop({ required: true })
  description: string;

  // Where
  @Prop({ default: "tbilisi", index: true })
  cityKey: string;

  @Prop()
  address?: string;

  // When — loose bucket from the intake form
  @Prop({ default: "flexible" })
  timing: ServiceRequestTiming;

  // Who to call
  @Prop({ required: true })
  name: string;

  @Prop({ required: true, index: true })
  phone: string;

  @Prop()
  email?: string;

  // Intake UX metadata (locale picked on submit, UA for debugging)
  @Prop()
  locale?: string;

  @Prop()
  userAgent?: string;

  // Funnel tracking — admin moves this through states
  @Prop({
    required: true,
    enum: ["new", "contacted", "quoted", "booked", "dropped"],
    default: "new",
    index: true,
  })
  status: ServiceRequestStatus;

  @Prop()
  notes?: string;

  // Placeholder for when we wire Telegram later — stores the message id so
  // we can edit status into the thread.
  @Prop()
  telegramMessageId?: string;
}

export const ServiceRequestSchema =
  SchemaFactory.createForClass(ServiceRequest);
