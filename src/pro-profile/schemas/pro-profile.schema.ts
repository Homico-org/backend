import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export enum PricingModel {
  HOURLY = 'hourly',
  DAILY = 'daily',
  SQM = 'sqm',
  PROJECT_BASED = 'project_based',
  FROM = 'from',
}

export enum ProStatus {
  ACTIVE = 'active',
  BUSY = 'busy',
  AWAY = 'away',
}

// Company subdocument schema
export class Company {
  @Prop()
  name: string;

  @Prop()
  logo?: string;

  @Prop()
  role?: string;
}

@Schema({ timestamps: true })
export class ProProfile extends Document {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, unique: true })
  userId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Company' })
  companyId: Types.ObjectId;

  @Prop()
  title: string;

  @Prop()
  companyName: string;

  @Prop()
  description: string;

  @Prop({ type: [String], default: [] })
  categories: string[];

  @Prop({ type: [String], default: [] })
  subcategories: string[];

  @Prop({ default: 0 })
  yearsExperience: number;

  @Prop({ type: [String], default: [] })
  serviceAreas: string[];

  @Prop({
    type: String,
    enum: Object.values(PricingModel),
    default: PricingModel.PROJECT_BASED
  })
  pricingModel: PricingModel;

  @Prop()
  basePrice: number;

  @Prop()
  maxPrice: number;

  @Prop()
  currency: string;

  @Prop({ default: 0 })
  avgRating: number;

  @Prop({ default: 0 })
  totalReviews: number;

  @Prop({ default: 0 })
  completedJobs: number;

  @Prop({ default: 0 })
  externalCompletedJobs: number;

  @Prop()
  responseTime: string;

  @Prop({ default: true })
  isAvailable: boolean;

  @Prop({
    type: String,
    enum: Object.values(ProStatus),
    default: ProStatus.ACTIVE,
  })
  status: ProStatus;

  @Prop()
  statusUpdatedAt: Date;

  @Prop({ default: false })
  statusAutoSuggested: boolean;

  @Prop()
  coverImage: string;

  @Prop({ type: [String], default: [] })
  certifications: string[];

  @Prop({ type: [String], default: [] })
  languages: string[];

  @Prop()
  tagline: string;

  @Prop()
  bio: string;

  @Prop()
  avatar: string;

  @Prop({ default: 'personal' })
  profileType: string; // 'personal' or 'company'

  @Prop({
    type: [{
      id: String,
      title: String,
      description: String,
      location: String,
      images: [String],
      videos: [String],
      beforeAfterPairs: [{ id: String, beforeImage: String, afterImage: String }]
    }],
    default: []
  })
  portfolioProjects: {
    id?: string;
    title: string;
    description: string;
    location: string;
    images: string[];
    videos: string[];
    beforeAfterPairs?: { id?: string; beforeImage: string; afterImage: string }[];
  }[];

  @Prop({ type: [{ name: String, logo: String, role: String }], default: [] })
  companies: Company[];

  // Category-specific fields

  // Interior Designer specific fields
  @Prop({ type: [String], default: [] })
  pinterestLinks: string[]; // Pinterest board/pin URLs for portfolio

  @Prop({ type: [String], default: [] })
  portfolioImages: string[]; // Direct portfolio image URLs

  @Prop()
  designStyle: string; // e.g., "Modern", "Minimalist", "Classic", "Scandinavian"

  // Architect specific fields
  @Prop()
  cadastralId: string; // Cadastral ID from Public Service Hall (საკადასტრო კოდი)

  @Prop({ default: false })
  cadastralVerified: boolean; // Whether the cadastral ID has been verified

  @Prop()
  architectLicenseNumber: string; // Professional license number

  @Prop({ type: [String], default: [] })
  completedProjects: string[]; // References to completed building projects

  // Verification status
  @Prop({ default: 'pending' })
  verificationStatus: string; // 'pending', 'verified', 'rejected'

  @Prop()
  verificationNotes: string;
}

export const ProProfileSchema = SchemaFactory.createForClass(ProProfile);

ProProfileSchema.index({ userId: 1 });
ProProfileSchema.index({ categories: 1 });
ProProfileSchema.index({ subcategories: 1 });
ProProfileSchema.index({ serviceAreas: 1 });
ProProfileSchema.index({ avgRating: -1 });
ProProfileSchema.index({ isAvailable: 1 });
ProProfileSchema.index({ companyId: 1 });
ProProfileSchema.index({ companyName: 1 });
ProProfileSchema.index({ status: 1, avgRating: -1 }); // For sorting active pros first
