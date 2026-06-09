import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

/**
 * One row per external shop we ingest products from (e.g. legoroom.ge).
 *
 * `sourceType` is the swap-to-feed seam: v1 ships every supplier as 'scrape'
 * (a polite HTML crawl behind a SupplierAdapter). When a partnership closes we
 * write a feed adapter, flip this to 'feed', and nothing downstream changes.
 *
 * Sync bookkeeping (lastSyncedAt / lastSyncStatus / lastSyncStats) lets the
 * admin surface answer "did the daily crawl run and what did it find".
 */

export type SupplierSourceType = 'scrape' | 'feed';

export type SupplierSyncStatus =
  | 'idle'
  | 'running'
  | 'success'
  | 'partial'
  | 'error';

@Schema({ _id: false })
export class SupplierSyncStats {
  @Prop({ default: 0 })
  scanned: number;

  @Prop({ default: 0 })
  upserted: number;

  @Prop({ default: 0 })
  markedUnavailable: number;

  @Prop({ default: 0 })
  durationMs: number;
}

@Schema({ timestamps: true, collection: 'suppliers' })
export class Supplier extends Document {
  /** Stable machine key, e.g. 'legoroom'. Used to resolve the adapter. */
  @Prop({ required: true, unique: true })
  key: string;

  @Prop({ required: true })
  name: string;

  @Prop({ required: true })
  baseUrl: string;

  @Prop({ type: String, enum: ['scrape', 'feed'], default: 'scrape' })
  sourceType: SupplierSourceType;

  @Prop({ default: true })
  isActive: boolean;

  @Prop()
  lastSyncedAt?: Date;

  @Prop({
    type: String,
    enum: ['idle', 'running', 'success', 'partial', 'error'],
    default: 'idle',
  })
  lastSyncStatus: SupplierSyncStatus;

  @Prop()
  lastSyncError?: string;

  /** Denormalized count of available products after the last successful sync. */
  @Prop({ default: 0 })
  productCount: number;

  @Prop({ type: SupplierSyncStats })
  lastSyncStats?: SupplierSyncStats;

  // Provided by timestamps: true.
  createdAt: Date;
  updatedAt: Date;
}

export const SupplierSchema = SchemaFactory.createForClass(Supplier);

SupplierSchema.index({ key: 1 }, { unique: true });
