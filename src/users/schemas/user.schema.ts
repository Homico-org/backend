import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

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

// Payment method embedded schema
export class PaymentMethod {
  id: string;
  type: 'card' | 'bank';
  // For cards: last 4 digits, brand (Visa, Mastercard), expiry
  cardLast4?: string;
  cardBrand?: string;
  cardExpiry?: string;
  cardholderName?: string;
  // For bank: bank name, masked IBAN
  bankName?: string;
  maskedIban?: string;
  // Common
  isDefault: boolean;
  createdAt: Date;
}

// Company subdocument schema for pro users
export class Company {
  name: string;
  logo?: string;
  role?: string;
}

// Portfolio project subdocument
export class PortfolioProject {
  id?: string;
  title: string;
  description: string;
  location?: string;
  images: string[];
  videos?: string[];
  beforeAfterPairs?: { id?: string; beforeImage: string; afterImage: string }[];
  source?: 'external' | 'homico'; // 'external' = work done outside Homico, 'homico' = completed via platform
  jobId?: string; // Reference to original job if done through Homico
}

@Schema({ timestamps: true })
export class User extends Document {
  @Prop({ unique: true, index: true })
  uid: number;

  @Prop({ required: true })
  name: string;

  @Prop({ unique: true, sparse: true, lowercase: true })
  email: string;

  @Prop()
  password: string;

  @Prop({ unique: true, sparse: true })
  googleId: string;

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

  // Notification preferences
  @Prop({ type: Object, default: null })
  notificationPreferences: {
    email: {
      enabled: boolean;
      newJobs: boolean;
      proposals: boolean;
      messages: boolean;
      marketing: boolean;
    };
    push: {
      enabled: boolean;
      newJobs: boolean;
      proposals: boolean;
      messages: boolean;
    };
    sms: {
      enabled: boolean;
      proposals: boolean;
      messages: boolean;
    };
  };

  // Payment methods
  @Prop({ type: [Object], default: [] })
  paymentMethods: PaymentMethod[];

  // ============== PRO-SPECIFIC FIELDS ==============
  // These fields are populated when a user with role=pro updates their profile

  @Prop({ type: Types.ObjectId, ref: 'Company' })
  companyId: Types.ObjectId;

  @Prop()
  title: string;

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
      beforeAfterPairs: [{ id: String, beforeImage: String, afterImage: String }],
      source: { type: String, enum: ['external', 'homico'], default: 'external' },
      jobId: String
    }],
    default: []
  })
  portfolioProjects: PortfolioProject[];

  @Prop({ type: [{ name: String, logo: String, role: String }], default: [] })
  companies: Company[];

  // Interior Designer specific fields
  @Prop({ type: [String], default: [] })
  pinterestLinks: string[];

  @Prop({ type: [String], default: [] })
  portfolioImages: string[];

  @Prop()
  designStyle: string;

  @Prop({ type: [String], default: [] })
  designStyles: string[];

  // Architect specific fields
  @Prop()
  cadastralId: string;

  @Prop({ default: false })
  cadastralVerified: boolean;

  @Prop()
  architectLicenseNumber: string;

  @Prop({ type: [String], default: [] })
  completedProjects: string[];

  // Verification status
  @Prop({ default: 'pending' })
  verificationStatus: string;

  @Prop()
  verificationNotes: string;

  // Premium status
  @Prop({ default: false })
  isPremium: boolean;

  @Prop()
  premiumExpiresAt: Date;

  @Prop({ default: 'none' })
  premiumTier: string;

  // Availability (for home-care services)
  @Prop({ type: [String], default: [] })
  availability: string[];

  // Pro profile completion status (set to true when pro completes profile setup)
  @Prop({ default: false })
  isProfileCompleted: boolean;

  // Pro Profile Deactivation (temporary pause)
  @Prop({ default: false })
  isProfileDeactivated: boolean;

  @Prop()
  deactivatedAt: Date;

  @Prop()
  deactivatedUntil: Date;

  @Prop()
  deactivationReason: string;
}

export const UserSchema = SchemaFactory.createForClass(User);

UserSchema.index({ email: 1 }, { sparse: true });
UserSchema.index({ role: 1 });
UserSchema.index({ phone: 1 }, { unique: true, sparse: true });
UserSchema.index({ googleId: 1 }, { unique: true, sparse: true });
UserSchema.index({ categories: 1 });
UserSchema.index({ subcategories: 1 });
UserSchema.index({ serviceAreas: 1 });
UserSchema.index({ avgRating: -1 });
UserSchema.index({ isAvailable: 1 });
UserSchema.index({ companyId: 1 });
UserSchema.index({ companyName: 1 });
UserSchema.index({ status: 1, avgRating: -1 });
UserSchema.index({ isPremium: -1, avgRating: -1 });
