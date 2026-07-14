import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

/**
 * One row per external shop we ingest products from (e.g. legoroom.ge).
 *
 * `sourceType` is the swap-to-feed seam: v1 ships every supplier as 'scrape'
 * (a polite HTML crawl behind a SupplierAdapter). When a partnership closes we
 * write a feed adapter, flip this to 'feed', and nothing downstream changes.
 * `'manual'` is the self-serve seller portal (Phase B): a shop that signs up on
 * Homico and manages its own products - no adapter, `ownerUserId` set.
 *
 * Sync bookkeeping (lastSyncedAt / lastSyncStatus / lastSyncStats) lets the
 * admin surface answer "did the daily crawl run and what did it find".
 */

export type SupplierSourceType = 'scrape' | 'feed' | 'manual';

/**
 * Moderation gate for self-serve shops. Suppliers we add ourselves default to
 * 'approved'; a shop that signs up starts 'pending' (hidden from the public
 * catalog) until an admin approves. Existing docs have no `status` and are
 * treated as visible - the public filter only excludes pending/suspended.
 */
export type SupplierStatus = 'pending' | 'approved' | 'suspended';

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

  @Prop({ type: String, enum: ['scrape', 'feed', 'manual'], default: 'scrape' })
  sourceType: SupplierSourceType;

  @Prop({ default: true })
  isActive: boolean;

  // === Self-serve seller portal (Phase B) - only set for sourceType 'manual'. ===

  /** The shop owner's user id. Scopes seller endpoints to their own shop. */
  @Prop({ type: Types.ObjectId, ref: 'User', index: true })
  ownerUserId?: Types.ObjectId;

  /**
   * Moderation gate. Self-serve shops start 'pending' (hidden) until approved;
   * suppliers we add ourselves are 'approved'. Absent on legacy docs = visible.
   */
  @Prop({ type: String, enum: ['pending', 'approved', 'suspended'], default: 'approved' })
  status: SupplierStatus;

  /** Shop logo url (self-serve shops upload their own). */
  @Prop()
  logo?: string;

  /** Registered legal entity name (for invoicing / payout). */
  @Prop()
  legalName?: string;

  /** Tax / company id number. */
  @Prop()
  taxId?: string;

  /** IBAN the shop is paid out to. */
  @Prop()
  payoutIban?: string;

  /** Flat delivery fee in minor units (tetri); 0 = free / arranged separately. */
  @Prop({ default: 0 })
  deliveryFeeMinor: number;

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
// `key` is already declared unique via @Prop({ unique: true }); no explicit
// index() here to avoid a duplicate-index warning.
