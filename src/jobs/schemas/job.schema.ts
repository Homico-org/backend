import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export enum JobStatus {
  OPEN = 'open',
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled',
}

export enum JobBudgetType {
  FIXED = 'fixed',
  RANGE = 'range',
  PER_SQUARE_METER = 'per_sqm',
  NEGOTIABLE = 'negotiable',
}

export enum JobSizeUnit {
  SQUARE_METER = 'sqm',
  ROOM = 'room',
  UNIT = 'unit',
  FLOOR = 'floor',
  ITEM = 'item',
}

export enum JobPropertyType {
  APARTMENT = 'apartment',
  OFFICE = 'office',
  BUILDING = 'building',
  HOUSE = 'house',
  OTHER = 'other',
}

@Schema({ timestamps: true })
export class Job extends Document {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  clientId: Types.ObjectId;

  @Prop({ required: true, trim: true })
  title: string;

  @Prop({ required: true })
  description: string;

  @Prop({ required: true })
  category: string;

  @Prop({ type: [String], default: [] })
  skills: string[];

  @Prop({ required: true })
  location: string;

  @Prop({
    type: String,
    enum: Object.values(JobPropertyType),
    required: true
  })
  propertyType: JobPropertyType;

  @Prop({ type: String })
  propertyTypeOther: string; // Custom property type when propertyType is 'other'

  // ====== ARCHITECTURE-SPECIFIC FIELDS ======
  @Prop({ type: String })
  cadastralId: string; // Cadastral registry ID

  @Prop({ type: String })
  landArea: string; // Land plot size

  @Prop({ type: Number })
  floorCount: number; // Number of floors

  @Prop({ type: String })
  projectPhase: string; // concept, schematic, detailed, construction

  @Prop({ type: Boolean, default: false })
  permitRequired: boolean; // Building permit needed

  @Prop({ type: String })
  currentCondition: string; // empty land, old building, etc.

  @Prop({ type: String })
  zoningType: string; // residential, commercial, mixed

  // ====== INTERIOR DESIGN-SPECIFIC FIELDS ======
  @Prop({ type: String })
  designStyle: string; // modern, minimalist, classic, etc.

  @Prop({ type: [String], default: [] })
  roomsToDesign: string[]; // living room, bedroom, kitchen, etc.

  @Prop({ type: Boolean, default: false })
  furnitureIncluded: boolean; // Need furniture selection/purchase

  @Prop({ type: Boolean, default: false })
  visualizationNeeded: boolean; // 3D renders needed

  @Prop({
    type: [{
      type: { type: String, enum: ['link', 'image', 'pinterest', 'instagram'], default: 'link' },
      url: { type: String, required: true },
      title: { type: String },
      thumbnail: { type: String },
    }],
    default: []
  })
  references: {
    type: 'link' | 'image' | 'pinterest' | 'instagram';
    url: string;
    title?: string;
    thumbnail?: string;
  }[];

  @Prop({ type: [String], default: [] })
  preferredColors: string[];

  @Prop({ type: String })
  existingFurniture: string; // keep all, keep some, replace all

  // ====== RENOVATION/CONSTRUCTION-SPECIFIC FIELDS ======
  @Prop({ type: [String], default: [] })
  workTypes: string[]; // demolition, walls, electrical, plumbing, etc.

  @Prop({ type: Boolean, default: false })
  materialsProvided: boolean; // Client provides materials

  @Prop({ type: String })
  materialsNote: string; // Notes about materials

  @Prop({ type: Boolean, default: false })
  occupiedDuringWork: boolean; // Will client live there during work

  // Area/Size specifications
  @Prop({ type: Number })
  areaSize: number;

  @Prop({
    type: String,
    enum: Object.values(JobSizeUnit),
  })
  sizeUnit: JobSizeUnit;

  @Prop({ type: Number })
  roomCount: number;

  // Budget specifications
  @Prop({
    type: String,
    enum: Object.values(JobBudgetType),
    default: JobBudgetType.NEGOTIABLE
  })
  budgetType: JobBudgetType;

  // For FIXED budget type - exact amount
  @Prop({ type: Number })
  budgetAmount: number;

  // For RANGE budget type - min/max range
  @Prop({ type: Number })
  budgetMin: number;

  @Prop({ type: Number })
  budgetMax: number;

  // For PER_SQUARE_METER budget type - price per unit
  @Prop({ type: Number })
  pricePerUnit: number;

  @Prop({ type: Date })
  deadline: Date;

  @Prop({
    type: String,
    enum: Object.values(JobStatus),
    default: JobStatus.OPEN
  })
  status: JobStatus;

  @Prop({ type: [String], default: [] })
  images: string[];

  @Prop({
    type: [{
      type: { type: String, enum: ['image', 'video'], default: 'image' },
      url: { type: String, required: true },
      thumbnail: { type: String },
    }],
    default: []
  })
  media: {
    type: 'image' | 'video';
    url: string;
    thumbnail?: string;
  }[];

  @Prop({ type: Number, default: 0 })
  proposalCount: number;

  @Prop({ type: Number, default: 0 })
  viewCount: number;
}

export const JobSchema = SchemaFactory.createForClass(Job);
