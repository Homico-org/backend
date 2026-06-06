import { Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';

export type DeliveryMode = 'all' | 'bulk' | 'by_items';
export const DELIVERY_MODES: DeliveryMode[] = ['all', 'bulk', 'by_items'];

export class OrderItemInputDto {
  /** SupplierProduct _id. Price + availability are re-validated server-side. */
  @IsString()
  supplierProductId: string;

  @IsInt()
  @Min(1)
  qty: number;

  /** Price (tetri) the customer saw in their cart; used to flag reprices. */
  @IsOptional()
  @IsInt()
  expectedUnitPriceMinor?: number;
}

export class DeliveryAddressDto {
  @IsString()
  formattedAddress: string;

  @IsString()
  phone: string;

  @IsOptional()
  @IsString()
  apartment?: string;

  @IsOptional()
  @IsString()
  floor?: string;

  @IsOptional()
  @IsString()
  entrance?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsNumber()
  lat?: number;

  @IsOptional()
  @IsNumber()
  lng?: number;
}

export class CreateOrderDto {
  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => OrderItemInputDto)
  items: OrderItemInputDto[];

  @ValidateNested()
  @Type(() => DeliveryAddressDto)
  deliveryAddress: DeliveryAddressDto;

  /** Delivery timing/grouping. Defaults to one combined delivery ('all'). */
  @IsOptional()
  @IsIn(DELIVERY_MODES)
  deliveryMode?: DeliveryMode;

  @IsOptional()
  @IsString()
  customerNote?: string;
}
