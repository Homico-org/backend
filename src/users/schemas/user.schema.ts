import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export enum UserRole {
  CLIENT = 'client',
  PRO = 'pro',
  COMPANY = 'company',
  ADMIN = 'admin',
}

export enum AccountType {
  INDIVIDUAL = 'individual',
  ORGANIZATION = 'organization',
}

@Schema({ timestamps: true })
export class User extends Document {
  @Prop({ required: true })
  name: string;

  @Prop({ unique: true, sparse: true, lowercase: true })
  email: string;

  @Prop({ required: true })
  password: string;

  @Prop({
    type: String,
    enum: Object.values(UserRole),
    default: UserRole.CLIENT
  })
  role: UserRole;

  @Prop()
  phone: string;

  @Prop()
  whatsapp: string;

  @Prop()
  telegram: string;

  @Prop()
  city: string;

  @Prop()
  avatar: string;

  @Prop({
    type: String,
    enum: Object.values(AccountType),
    default: AccountType.INDIVIDUAL
  })
  accountType: AccountType;

  @Prop()
  companyName: string;

  @Prop({ required: true, unique: true })
  idNumber: string;

  @Prop({ default: true })
  isActive: boolean;

  @Prop()
  lastLoginAt: Date;

  @Prop({ type: [String], default: [] })
  selectedCategories: string[];

  @Prop({ type: [String], default: [] })
  selectedSubcategories: string[];

  // Verification fields
  @Prop({ default: false })
  isEmailVerified: boolean;

  @Prop({ default: false })
  isPhoneVerified: boolean;

  @Prop()
  emailVerifiedAt: Date;

  @Prop()
  phoneVerifiedAt: Date;
}

export const UserSchema = SchemaFactory.createForClass(User);

UserSchema.index({ email: 1 }, { sparse: true });
UserSchema.index({ role: 1 });
UserSchema.index({ phone: 1 }, { unique: true, sparse: true });
