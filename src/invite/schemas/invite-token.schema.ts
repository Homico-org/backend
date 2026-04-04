import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { Document, Types } from "mongoose";

@Schema({ timestamps: true })
export class InviteToken extends Document {
  @Prop({ required: true, unique: true, index: true })
  token: string;

  @Prop({ required: true, index: true })
  phone: string;

  @Prop({ required: true })
  name: string;

  @Prop()
  city: string;

  @Prop()
  cityKey: string;

  @Prop({ required: true })
  category: string;

  @Prop({ required: true })
  subcategory: string;

  @Prop()
  categoryKa: string;

  @Prop()
  subcategoryKa: string;

  @Prop()
  type: string; // professional | service | tool-rental

  @Prop({ unique: true, sparse: true })
  servisebiId: number;

  @Prop({ default: 0 })
  rating: number;

  @Prop({ default: 0 })
  reviewCount: number;

  // CRM funnel: pending → sms_sent → opened → activated
  @Prop({ default: "pending", index: true })
  status: string;

  @Prop()
  smsSentAt: Date;

  @Prop()
  smsFailedAt: Date;

  @Prop()
  smsError: string;

  @Prop()
  openedAt: Date;

  @Prop({ default: 0 })
  openCount: number;

  @Prop()
  activatedAt: Date;

  @Prop({ type: Types.ObjectId, ref: "User" })
  userId: Types.ObjectId;
}

export const InviteTokenSchema = SchemaFactory.createForClass(InviteToken);
