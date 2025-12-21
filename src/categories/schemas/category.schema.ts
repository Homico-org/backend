import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

// Sub-subcategory (3rd level)
@Schema({ _id: false })
export class SubSubcategory {
  @Prop({ required: true })
  key: string;

  @Prop({ required: true })
  name: string;

  @Prop({ required: true })
  nameKa: string;

  @Prop()
  icon?: string;

  @Prop({ type: [String], default: [] })
  keywords: string[];

  @Prop({ default: 0 })
  sortOrder: number;

  @Prop({ default: true })
  isActive: boolean;
}

export const SubSubcategorySchema = SchemaFactory.createForClass(SubSubcategory);

// Subcategory (2nd level)
@Schema({ _id: false })
export class Subcategory {
  @Prop({ required: true })
  key: string;

  @Prop({ required: true })
  name: string;

  @Prop({ required: true })
  nameKa: string;

  @Prop()
  icon?: string;

  @Prop({ type: [String], default: [] })
  keywords: string[];

  @Prop({ default: 0 })
  sortOrder: number;

  @Prop({ default: true })
  isActive: boolean;

  @Prop({ type: [SubSubcategorySchema], default: [] })
  children: SubSubcategory[];
}

export const SubcategorySchema = SchemaFactory.createForClass(Subcategory);

// Main Category (1st level)
@Schema({ timestamps: true })
export class Category extends Document {
  @Prop({ required: true, unique: true })
  key: string;

  @Prop({ required: true })
  name: string;

  @Prop({ required: true })
  nameKa: string;

  @Prop()
  description?: string;

  @Prop()
  descriptionKa?: string;

  @Prop()
  icon?: string;

  @Prop({ type: [String], default: [] })
  keywords: string[];

  @Prop({ default: true })
  isActive: boolean;

  @Prop({ default: 0 })
  sortOrder: number;

  @Prop({ type: [SubcategorySchema], default: [] })
  subcategories: Subcategory[];
}

export const CategorySchema = SchemaFactory.createForClass(Category);

CategorySchema.index({ key: 1 });
CategorySchema.index({ isActive: 1 });
CategorySchema.index({ sortOrder: 1 });
CategorySchema.index({ 'subcategories.key': 1 });
CategorySchema.index({ 'subcategories.children.key': 1 });
