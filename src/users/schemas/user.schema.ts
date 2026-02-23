import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export enum UserRole {
  CLIENT = 'client',
  PRO = 'pro',
  ADMIN = 'admin',
}

export enum AccountType {
  INDIVIDUAL = 'individual',
  ORGANIZATION = 'organization',
}

export enum PricingModel {
  // New canonical values (product requirement)
  FIXED = 'fixed',
  RANGE = 'range',
  BY_AGREEMENT = 'byAgreement',
  PER_SQUARE_METER = 'per_sqm',

  // Legacy values (backward compatibility; will be normalized on read/write)
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

// Service address embedded schema
export class ServiceAddress {
  id: string;
  label: 'home' | 'work' | 'custom';
  customLabel?: string;
  formattedAddress: string;
  lat: number;
  lng: number;
  apartment?: string;
  floor?: string;
  entrance?: string;
  notes?: string;
  isDefault: boolean;
  createdAt: Date;
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

  @Prop({ default: true })
  isActive: boolean;

  @Prop()
  lastLoginAt: Date;

  @Prop({ type: [String], default: [] })
  selectedCategories: string[];

  @Prop({ type: [String], default: [] })
  selectedSubcategories: string[];

  // Selected services with experience level per service
  @Prop({
    type: [{
      key: String,         // Subcategory key
      categoryKey: String, // Parent category key
      name: String,        // English name
      nameKa: String,      // Georgian name
      experience: String,  // Experience level: '0-1', '1-3', '3-5', '5-10', '10+'
    }],
    default: []
  })
  selectedServices: {
    key: string;
    categoryKey: string;
    name: string;
    nameKa: string;
    experience: string;
  }[];

  // Verification fields
  @Prop({ default: false })
  isEmailVerified: boolean;

  @Prop({ default: false })
  isPhoneVerified: boolean;

  @Prop()
  emailVerifiedAt: Date;

  @Prop()
  phoneVerifiedAt: Date;

  // Pending email change (stores new email until verified)
  @Prop()
  pendingEmail: string;

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

  // Service addresses
  @Prop({ type: [Object], default: [] })
  serviceAddresses: ServiceAddress[];

  // Payment methods
  @Prop({ type: [Object], default: [] })
  paymentMethods: PaymentMethod[];

  // ============== PRO-SPECIFIC FIELDS ==============
  // These fields are populated when a user with role=pro updates their profile

  @Prop()
  title: string;

  @Prop()
  description: string;

  @Prop({ type: [String], default: [] })
  categories: string[];

  @Prop({ type: [String], default: [] })
  subcategories: string[];

  // Custom services added by user during registration (free-form text services)
  @Prop({ type: [String], default: [] })
  customServices: string[];

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
  profileViewCount: number;

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

  // Social links for verification
  @Prop()
  facebookUrl: string;

  @Prop()
  instagramUrl: string;

  @Prop()
  linkedinUrl: string;

  @Prop()
  websiteUrl: string;

  // ID Verification documents
  @Prop()
  idDocumentUrl: string;  // ID card/passport front

  @Prop()
  idDocumentBackUrl: string;  // ID card back (optional)

  @Prop()
  selfieWithIdUrl: string;  // Selfie holding ID

  @Prop()
  verificationSubmittedAt: Date;

  // Verification status
  @Prop({ default: 'pending' })
  verificationStatus: string;  // pending, submitted, verified, rejected

  @Prop()
  verificationNotes: string;

  @Prop()
  verifiedAt: Date;

  @Prop()
  verifiedBy: string;  // Admin user ID who verified

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

  // Admin approval status (pro profiles require admin approval before being visible)
  @Prop({ default: false })
  isAdminApproved: boolean;

  @Prop()
  adminApprovedAt: Date;

  @Prop()
  adminApprovedBy: string;  // Admin user ID who approved

  @Prop()
  adminRejectionReason: string;

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

function normalizePricingModel(
  pricingModel: any,
  basePrice: any,
  maxPrice: any,
): 'fixed' | 'range' | 'byAgreement' | 'per_sqm' {
  // Explicit byAgreement / legacy hourly => byAgreement
  if (pricingModel === 'byAgreement' || pricingModel === 'hourly') return 'byAgreement';

  const base = typeof basePrice === 'number' ? basePrice : basePrice ? Number(basePrice) : null;
  const max = typeof maxPrice === 'number' ? maxPrice : maxPrice ? Number(maxPrice) : null;

  const hasBase = base !== null && !Number.isNaN(base) && base > 0;
  const hasMax = max !== null && !Number.isNaN(max) && max > 0;

  // Per-square-meter pricing (new canonical or legacy sqm)
  if (pricingModel === 'per_sqm' || pricingModel === 'sqm') {
    return (hasBase || hasMax) ? 'per_sqm' : 'byAgreement';
  }

  // Explicit 'range' with valid prices - preserve the user's choice
  if (pricingModel === 'range' && hasBase && hasMax) {
    return 'range';
  }

  // Explicit 'fixed' with a valid price - preserve the user's choice
  if (pricingModel === 'fixed' && (hasBase || hasMax)) {
    return 'fixed';
  }

  // Legacy inference: if we have both and they differ, it's a range
  if (hasBase && hasMax && max !== base) return 'range';

  // If we have any numeric price at all, treat as fixed
  if (hasBase || hasMax) return 'fixed';

  return 'byAgreement';
}

// Normalize pricing model for all API responses
UserSchema.set('toJSON', {
  virtuals: true,
  transform: (_doc: any, ret: any) => {
    const normalized = normalizePricingModel(ret.pricingModel, ret.basePrice, ret.maxPrice);
    ret.pricingModel = normalized;
    if (normalized === 'byAgreement') {
      delete ret.basePrice;
      delete ret.maxPrice;
    } else if (normalized === 'per_sqm') {
      // Per m² uses a single numeric price (basePrice). Ensure maxPrice doesn't linger.
      if (ret.basePrice == null && ret.maxPrice != null) ret.basePrice = ret.maxPrice;
      delete ret.maxPrice;
    } else if (normalized === 'fixed') {
      // Collapse to a single price when possible
      if (ret.basePrice == null && ret.maxPrice != null) ret.basePrice = ret.maxPrice;
      if (ret.maxPrice == null && ret.basePrice != null) ret.maxPrice = ret.basePrice;
    }
    return ret;
  },
});

// Note: Mongoose 8 runs setters on $set by default, but the setter cannot see
// sibling fields (basePrice/maxPrice) being set in the same update operation.
// Normalization is handled by the service layer (input) and toJSON (output).

UserSchema.index({ email: 1 }, { sparse: true });
UserSchema.index({ role: 1 });
UserSchema.index({ phone: 1 }, { unique: true, sparse: true });
UserSchema.index({ googleId: 1 }, { unique: true, sparse: true });
UserSchema.index({ categories: 1 });
UserSchema.index({ subcategories: 1 });
UserSchema.index({ serviceAreas: 1 });
UserSchema.index({ avgRating: -1 });
UserSchema.index({ isAvailable: 1 });
UserSchema.index({ status: 1, avgRating: -1 });
UserSchema.index({ isPremium: -1, avgRating: -1 });
UserSchema.index({ isAdminApproved: 1, role: 1 });
UserSchema.index({ verificationStatus: 1, role: 1 });
