import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

// === Enums ===

export enum ServiceUnit {
  PIECE = 'piece',
  SQM = 'sqm',
  METER = 'meter',
  POINT = 'point',
  ROOM = 'room',
  SET = 'set',
  HOUR = 'hour',
  FLOOR = 'floor',
  ITEM = 'item',
  DEVICE = 'device',
  WINDOW = 'window',
}

// === Sub-schemas (embedded documents) ===

@Schema({ _id: false })
export class DiscountTier {
  @Prop({ required: true })
  minQuantity: number;

  @Prop({ required: true })
  percent: number;
}

@Schema({ _id: false })
export class LocalizedText {
  @Prop({ required: true })
  en: string;

  @Prop({ required: true })
  ka: string;

  @Prop({ default: '' })
  ru: string;
}

@Schema({ _id: false })
export class PriceRange {
  @Prop({ required: true })
  min: number;

  @Prop()
  max?: number;
}

@Schema({ _id: false })
export class CatalogService {
  @Prop({ required: true })
  key: string;

  @Prop({ type: LocalizedText, required: true })
  label: LocalizedText;

  @Prop({ type: LocalizedText })
  description?: LocalizedText;

  @Prop({ required: true })
  basePrice: number;

  @Prop()
  maxPrice?: number;

  @Prop({ type: String, enum: Object.values(ServiceUnit), required: true })
  unit: ServiceUnit;

  @Prop({ type: LocalizedText, required: true })
  unitLabel: LocalizedText;

  @Prop()
  maxQuantity?: number;

  @Prop()
  step?: number;

  @Prop({ type: [Object], default: [] })
  discountTiers?: DiscountTier[];
}

@Schema({ _id: false })
export class CatalogAddon {
  @Prop({ required: true })
  key: string;

  @Prop({ type: LocalizedText, required: true })
  label: LocalizedText;

  @Prop({ type: LocalizedText, required: true })
  promptLabel: LocalizedText;

  @Prop({ required: true })
  basePrice: number;

  @Prop()
  maxPrice?: number;

  @Prop({ type: String, enum: Object.values(ServiceUnit), required: true })
  unit: ServiceUnit;

  @Prop({ type: LocalizedText, required: true })
  unitLabel: LocalizedText;

  @Prop()
  iconName?: string;
}

@Schema({ _id: false })
export class CatalogVariant {
  @Prop({ required: true })
  key: string;

  @Prop({ type: LocalizedText, required: true })
  label: LocalizedText;

  @Prop({ type: [Object], default: [] })
  services: CatalogService[];

  @Prop({ type: [Object], default: [] })
  addons: CatalogAddon[];

  @Prop({ type: [Object], default: [] })
  additionalServices: CatalogService[];
}

@Schema({ _id: false })
export class CatalogSubcategory {
  @Prop({ required: true })
  key: string;

  @Prop({ type: LocalizedText, required: true })
  label: LocalizedText;

  @Prop({ type: LocalizedText })
  description?: LocalizedText;

  @Prop({ required: true })
  iconName: string;

  @Prop()
  imageUrl?: string;

  @Prop({ type: PriceRange, required: true })
  priceRange: PriceRange;

  @Prop({ default: 0 })
  sortOrder: number;

  @Prop({ default: true })
  isActive: boolean;

  @Prop({ type: [Object], default: [] })
  variants: CatalogVariant[];

  @Prop({ type: [Object], default: [] })
  services: CatalogService[];

  @Prop({ type: [Object], default: [] })
  addons: CatalogAddon[];

  @Prop({ type: [Object], default: [] })
  additionalServices: CatalogService[];

  @Prop({ type: [Object], default: [] })
  orderDiscountTiers?: DiscountTier[];
}

// === Top-level document ===

@Schema({ timestamps: true })
export class ServiceCatalogCategory extends Document {
  @Prop({ required: true, unique: true })
  key: string;

  @Prop({ type: LocalizedText, required: true })
  label: LocalizedText;

  @Prop({ type: LocalizedText })
  description?: LocalizedText;

  @Prop({ required: true })
  iconName: string;

  @Prop({ required: true })
  color: string;

  @Prop({ required: true })
  minPrice: number;

  @Prop({ default: 0 })
  sortOrder: number;

  @Prop({ default: true })
  isActive: boolean;

  @Prop({ default: 1 })
  version: number;

  @Prop({ type: [Object], default: [] })
  subcategories: CatalogSubcategory[];
}

export const ServiceCatalogCategorySchema =
  SchemaFactory.createForClass(ServiceCatalogCategory);

ServiceCatalogCategorySchema.index({ key: 1 }, { unique: true });
ServiceCatalogCategorySchema.index({ isActive: 1 });
ServiceCatalogCategorySchema.index({ sortOrder: 1 });
