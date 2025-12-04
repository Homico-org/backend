import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export enum OtpType {
  EMAIL = 'email',
  PHONE = 'phone',
}

export enum OtpPurpose {
  VERIFICATION = 'verification',
  PASSWORD_RESET = 'password_reset',
}

@Schema({ timestamps: true })
export class Otp extends Document {
  @Prop({ required: true })
  identifier: string; // email or phone number

  @Prop({ required: true })
  code: string;

  @Prop({
    type: String,
    enum: Object.values(OtpType),
    required: true,
  })
  type: OtpType;

  @Prop({
    type: String,
    enum: Object.values(OtpPurpose),
    default: OtpPurpose.VERIFICATION,
  })
  purpose: OtpPurpose;

  @Prop({ required: true })
  expiresAt: Date;

  @Prop({ default: false })
  isUsed: boolean;

  @Prop({ default: 0 })
  attempts: number;
}

export const OtpSchema = SchemaFactory.createForClass(Otp);

// Index for faster lookups and auto-expire
OtpSchema.index({ identifier: 1, type: 1 });
OtpSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
