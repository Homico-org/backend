import { IsIn, IsOptional, IsString, IsNumber, Min } from 'class-validator';
import { OrderStatus } from '../schemas/order.schema';

const ADMIN_SETTABLE_STATUSES: OrderStatus[] = [
  'processing',
  'shipped',
  'delivered',
  'cancelled',
];

export class UpdateOrderStatusDto {
  @IsIn(ADMIN_SETTABLE_STATUSES)
  status: OrderStatus;

  @IsOptional()
  @IsString()
  note?: string;
}

export class RefundOrderDto {
  /** Optional partial refund in tetri; omit for a full refund. */
  @IsOptional()
  @IsNumber()
  @Min(1)
  amountMinor?: number;

  @IsString()
  reason: string;
}
