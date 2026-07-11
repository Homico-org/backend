import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { SupplierSourceType } from './supplier.schema';

/**
 * One row per product scraped (or fed) from an external supplier. This is the
 * searchable external catalog that powers the project Shopping tab.
 *
 * Prices are stored in MINOR units (tetri for GEL) to match the payments
 * module convention - so when dropship/checkout lands the numbers line up with
 * no conversion. `rawPrice` keeps the original scraped string for audit/reparse.
 *
 * Upsert key is (supplierKey, externalId). Each sync stamps `lastSeenAt`;
 * products not seen in the latest run get `isAvailable = false` (retired from
 * the source) rather than deleted, so saved project references never dangle.
 */
@Schema({ timestamps: true, collection: 'supplier_products' })
export class SupplierProduct extends Document {
  @Prop({ required: true, index: true })
  supplierKey: string;

  /** Supplier's own product id (e.g. legoroom /product/{id}). */
  @Prop({ required: true })
  externalId: string;

  @Prop({ required: true })
  externalUrl: string;

  /** Primary display name, as scraped (Georgian for legoroom). */
  @Prop({ required: true })
  name: string;

  /** Explicit ka copy. For legoroom this equals `name`. */
  @Prop()
  nameKa?: string;

  /**
   * Normalized search field (lowercased name + nameKa + category), populated at
   * upsert time. Single field the search query matches against; also the seam
   * an Atlas Search index would target at scale.
   */
  @Prop({ index: true })
  searchText?: string;

  /** Price in minor units (tetri). 11000 = 110.00 GEL. */
  @Prop({ required: true, default: 0 })
  priceMinor: number;

  @Prop({ required: true, default: 'GEL' })
  currency: string;

  @Prop()
  imageUrl?: string;

  @Prop({ type: [String], default: [] })
  imageUrls: string[];

  @Prop({ index: true })
  category?: string;

  @Prop()
  categoryLabel?: string;

  /** False when the product was not seen in the most recent sync. */
  @Prop({ default: true, index: true })
  isAvailable: boolean;

  /** Stock signal from the detail page when readable; undefined = unknown. */
  @Prop()
  inStock?: boolean;

  @Prop({ type: Date, default: Date.now })
  lastSeenAt: Date;

  // === Seams for dropship / partner feeds (unused in v1) ===

  @Prop()
  sku?: string;

  @Prop()
  stockQty?: number;

  /** Original scraped price text, e.g. '110.00 ₾'. */
  @Prop()
  rawPrice?: string;

  @Prop({
    type: [{ priceMinor: Number, at: Date }],
    default: [],
  })
  priceHistory: { priceMinor: number; at: Date }[];

  @Prop({ type: String, enum: ['scrape', 'feed', 'manual'], default: 'scrape' })
  sourceType: SupplierSourceType;

  /** Freeform attributes (color, size, m²/box) for future filtering. */
  @Prop({ type: Object })
  attributes?: Record<string, unknown>;

  /** Last raw normalized payload, mirrors payment.providerRawData. */
  @Prop({ type: Object })
  rawData?: unknown;

  // Provided by timestamps: true.
  createdAt: Date;
  updatedAt: Date;
}

export const SupplierProductSchema =
  SchemaFactory.createForClass(SupplierProduct);

// Upsert + uniqueness key.
SupplierProductSchema.index(
  { supplierKey: 1, externalId: 1 },
  { unique: true },
);
SupplierProductSchema.index({ supplierKey: 1, isAvailable: 1 });
SupplierProductSchema.index({ category: 1 });
SupplierProductSchema.index({ priceMinor: 1 });
// Text index kept as a forward-compatible seam. v1 search uses regex because
// Mongo $text has no Georgian analyzer and won't do substring matches.
SupplierProductSchema.index(
  { name: 'text', nameKa: 'text' },
  { default_language: 'none' },
);

/** Plain-object shape from `.lean()` queries. */
export interface SupplierProductDoc {
  _id: Types.ObjectId;
  supplierKey: string;
  externalId: string;
  externalUrl: string;
  name: string;
  nameKa?: string;
  priceMinor: number;
  currency: string;
  imageUrl?: string;
  imageUrls: string[];
  category?: string;
  categoryLabel?: string;
  isAvailable: boolean;
  inStock?: boolean;
  lastSeenAt: Date;
  sku?: string;
  stockQty?: number;
  rawPrice?: string;
  priceHistory: { priceMinor: number; at: Date }[];
  sourceType: SupplierSourceType;
  attributes?: Record<string, unknown>;
  rawData?: unknown;
  createdAt: Date;
  updatedAt: Date;
}
