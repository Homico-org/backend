import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

/** Self-serve shop signup / profile (Phase B). */
export class CreateShopDto {
  @IsString()
  @MaxLength(120)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  baseUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  logo?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  legalName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  taxId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  payoutIban?: string;

  /** Flat delivery fee in GEL (major units); converted to tetri on save. */
  @IsOptional()
  @IsNumber()
  @Min(0)
  deliveryFee?: number;
}

/** A seller creating or editing one of their own products. */
export class SellerProductDto {
  @IsOptional()
  @IsString()
  @MaxLength(300)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  nameKa?: string;

  /** Price in GEL (major units). */
  @IsOptional()
  @IsNumber()
  @Min(0)
  price?: number;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  category?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  categoryLabel?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  imageUrls?: string[];

  @IsOptional()
  @IsInt()
  @Min(0)
  stockQty?: number;

  /** List / delist the product without deleting it (availability toggle). */
  @IsOptional()
  @IsBoolean()
  isAvailable?: boolean;
}

/** Bulk product import (parsed client-side from CSV/Excel). */
export class BulkImportDto {
  @IsArray()
  @ArrayMaxSize(1000)
  @ValidateNested({ each: true })
  @Type(() => SellerProductDto)
  products: SellerProductDto[];
}
