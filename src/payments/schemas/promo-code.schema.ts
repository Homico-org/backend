import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { Document } from "mongoose";

export type PromoCodeDocument = PromoCode & Document;

/**
 * Discount kinds:
 *  - amount_off:  subtract `value` GEL from the price (clamped at 0)
 *  - percent_off: subtract `value`% from the price
 *  - fixed_price: set the price to exactly `value` GEL (e.g. "Super Pro -> 200")
 */
export type PromoDiscountType = "amount_off" | "percent_off" | "fixed_price";

@Schema({ timestamps: true })
export class PromoCode {
  // Stored UPPERCASE; lookups uppercase the input so codes are case-insensitive.
  @Prop({ required: true, unique: true, uppercase: true, trim: true, index: true })
  code: string;

  @Prop({ required: true, enum: ["amount_off", "percent_off", "fixed_price"] })
  discountType: PromoDiscountType;

  @Prop({ required: true })
  value: number;

  // Tier ids the code applies to (e.g. ["elite"]). Empty = all tiers.
  @Prop({ type: [String], default: [] })
  applicableTiers: string[];

  // 0 = unlimited.
  @Prop({ default: 0 })
  maxUses: number;

  @Prop({ default: 0 })
  usedCount: number;

  @Prop({ default: true })
  active: boolean;

  @Prop()
  expiresAt?: Date;

  // Optional free-text note for admins (campaign name, who it's for, etc.).
  @Prop()
  note?: string;
}

export const PromoCodeSchema = SchemaFactory.createForClass(PromoCode);
