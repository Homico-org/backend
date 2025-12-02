import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export enum CompanyStatus {
  PENDING = 'pending',
  ACTIVE = 'active',
  SUSPENDED = 'suspended',
}

export enum CompanySize {
  SOLO = '1',
  SMALL = '2-10',
  MEDIUM = '11-50',
  LARGE = '51-200',
  ENTERPRISE = '200+',
}

@Schema({ timestamps: true })
export class Company extends Document {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, unique: true })
  ownerId: Types.ObjectId;

  // Basic Info
  @Prop({ required: true })
  name: string;

  @Prop({ required: true })
  legalName: string;

  @Prop()
  description: string;

  @Prop()
  tagline: string;

  @Prop()
  logo: string;

  @Prop()
  coverImage: string;

  // Contact Info
  @Prop({ required: true })
  email: string;

  @Prop()
  phone: string;

  @Prop()
  website: string;

  // Location
  @Prop()
  address: string;

  @Prop()
  city: string;

  @Prop()
  country: string;

  @Prop({ type: { lat: Number, lng: Number } })
  coordinates: { lat: number; lng: number };

  // Business Details
  @Prop()
  taxId: string;

  @Prop()
  registrationNumber: string;

  @Prop()
  foundedYear: number;

  @Prop({
    type: String,
    enum: Object.values(CompanySize),
    default: CompanySize.SMALL,
  })
  size: CompanySize;

  // Services
  @Prop({ type: [String], default: [] })
  categories: string[];

  @Prop({ type: [String], default: [] })
  serviceAreas: string[];

  @Prop({ type: [String], default: [] })
  certifications: string[];

  @Prop({ type: [String], default: [] })
  languages: string[];

  // Stats & Metrics
  @Prop({ default: 0 })
  avgRating: number;

  @Prop({ default: 0 })
  totalReviews: number;

  @Prop({ default: 0 })
  completedJobs: number;

  @Prop({ default: 0 })
  activeWorkers: number;

  // Status
  @Prop({
    type: String,
    enum: Object.values(CompanyStatus),
    default: CompanyStatus.PENDING,
  })
  status: CompanyStatus;

  @Prop({ default: true })
  isHiring: boolean;

  @Prop({ default: true })
  acceptingJobs: boolean;

  // Working Hours
  @Prop({
    type: {
      monday: { open: String, close: String, closed: Boolean },
      tuesday: { open: String, close: String, closed: Boolean },
      wednesday: { open: String, close: String, closed: Boolean },
      thursday: { open: String, close: String, closed: Boolean },
      friday: { open: String, close: String, closed: Boolean },
      saturday: { open: String, close: String, closed: Boolean },
      sunday: { open: String, close: String, closed: Boolean },
    },
    default: {
      monday: { open: '09:00', close: '18:00', closed: false },
      tuesday: { open: '09:00', close: '18:00', closed: false },
      wednesday: { open: '09:00', close: '18:00', closed: false },
      thursday: { open: '09:00', close: '18:00', closed: false },
      friday: { open: '09:00', close: '18:00', closed: false },
      saturday: { open: '10:00', close: '16:00', closed: false },
      sunday: { open: '00:00', close: '00:00', closed: true },
    },
  })
  workingHours: {
    monday: { open: string; close: string; closed: boolean };
    tuesday: { open: string; close: string; closed: boolean };
    wednesday: { open: string; close: string; closed: boolean };
    thursday: { open: string; close: string; closed: boolean };
    friday: { open: string; close: string; closed: boolean };
    saturday: { open: string; close: string; closed: boolean };
    sunday: { open: string; close: string; closed: boolean };
  };

  // Social Links
  @Prop({ type: { facebook: String, instagram: String, linkedin: String, twitter: String } })
  socialLinks: {
    facebook?: string;
    instagram?: string;
    linkedin?: string;
    twitter?: string;
  };

  // Verification
  @Prop({ default: false })
  isVerified: boolean;

  @Prop()
  verifiedAt: Date;

  // Subscription/Plan (for future monetization)
  @Prop({ default: 'free' })
  plan: string;

  @Prop()
  planExpiresAt: Date;
}

export const CompanySchema = SchemaFactory.createForClass(Company);

CompanySchema.index({ ownerId: 1 });
CompanySchema.index({ categories: 1 });
CompanySchema.index({ serviceAreas: 1 });
CompanySchema.index({ city: 1 });
CompanySchema.index({ status: 1 });
CompanySchema.index({ avgRating: -1 });
CompanySchema.index({ name: 'text', description: 'text' });
