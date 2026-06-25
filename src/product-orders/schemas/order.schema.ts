import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

/**
 * A customer's product order. Homico is the merchant of record: the customer
 * pays Homico (Flitt) for the whole cart, and Homico fulfils it manually (ops
 * buys from each shop, arranges delivery). It is a platform charge - no escrow
 * (see PaymentEntityType 'product_order'). Items + address + totals are
 * snapshotted at order time so a later scrape/price change can't mutate a
 * placed order.
 */

export type OrderStatus =
  | 'awaiting_payment'
  | 'paid'
  | 'processing'
  | 'shipped'
  | 'delivered'
  | 'cancelled'
  | 'refunded'
  | 'payment_failed';

@Schema({ _id: false })
export class OrderItem {
  /** SupplierProduct _id this was bought from (for ops reference + reorder). */
  @Prop()
  supplierProductId?: string;

  @Prop({ required: true })
  supplierKey: string;

  @Prop({ required: true })
  name: string;

  @Prop()
  nameKa?: string;

  @Prop()
  externalUrl?: string;

  @Prop()
  imageUrl?: string;

  /** Unit price in tetri, snapshotted (and re-validated) at order time. */
  @Prop({ required: true })
  unitPriceMinor: number;

  @Prop({ required: true, default: 1 })
  qty: number;

  @Prop({ required: true })
  lineTotalMinor: number;
}

@Schema({ _id: false })
export class OrderDeliveryAddress {
  @Prop({ required: true })
  formattedAddress: string;

  @Prop({ required: true })
  phone: string;

  @Prop()
  apartment?: string;

  @Prop()
  floor?: string;

  @Prop()
  entrance?: string;

  @Prop()
  notes?: string;

  @Prop()
  lat?: number;

  @Prop()
  lng?: number;
}

@Schema({ _id: false })
export class OrderStatusEvent {
  @Prop({ required: true })
  status: OrderStatus;

  @Prop({ type: Date, default: Date.now })
  at: Date;

  @Prop()
  byUserId?: string;

  @Prop()
  note?: string;
}

@Schema({ timestamps: true, collection: 'product_orders' })
export class Order extends Document {
  /** Human-friendly short id shown to the customer + ops. */
  @Prop({ required: true, unique: true })
  orderNumber: string;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  customerId: Types.ObjectId;

  @Prop({ type: [OrderItem], default: [] })
  items: OrderItem[];

  @Prop({ required: true, default: 0 })
  subtotalMinor: number;

  /** Optional Homico service fee (config; usually 0 now delivery is explicit). */
  @Prop({ required: true, default: 0 })
  feeMinor: number;

  /** How the customer chose to receive the order. Delivery is mandatory. */
  @Prop({ enum: ['all', 'bulk', 'by_items'], default: 'all' })
  deliveryMode: 'all' | 'bulk' | 'by_items';

  /** Delivery fee (tetri) for the chosen mode, snapshotted at order time. */
  @Prop({ required: true, default: 0 })
  deliveryFeeMinor: number;

  @Prop({ required: true, default: 0 })
  totalMinor: number;

  @Prop({ required: true, default: 'GEL' })
  currency: string;

  @Prop({ type: OrderDeliveryAddress, required: true })
  deliveryAddress: OrderDeliveryAddress;

  @Prop()
  customerNote?: string;

  @Prop({
    required: true,
    enum: [
      'awaiting_payment',
      'paid',
      'processing',
      'shipped',
      'delivered',
      'cancelled',
      'refunded',
      'payment_failed',
    ],
    default: 'awaiting_payment',
    index: true,
  })
  status: OrderStatus;

  @Prop({ type: [OrderStatusEvent], default: [] })
  statusHistory: OrderStatusEvent[];

  @Prop({ type: Types.ObjectId })
  paymentId?: Types.ObjectId;

  @Prop()
  paymentStatus?: string;

  @Prop()
  paidAt?: Date;

  @Prop()
  cancelledAt?: Date;

  @Prop({ default: 0 })
  refundedAmountMinor: number;

  createdAt: Date;
  updatedAt: Date;
}

export const OrderSchema = SchemaFactory.createForClass(Order);
OrderSchema.index({ customerId: 1, createdAt: -1 });
OrderSchema.index({ orderNumber: 1 }, { unique: true });
