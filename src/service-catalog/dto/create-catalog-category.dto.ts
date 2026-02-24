import {
  IsString,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsBoolean,
  IsEnum,
  IsArray,
  ValidateNested,
  Min,
  Max,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ServiceUnit } from '../schemas/service-catalog.schema';

export class DiscountTierDto {
  @IsNumber()
  @Min(1)
  minQuantity: number;

  @IsNumber()
  @Min(0)
  @Max(100)
  percent: number;
}

export class LocalizedTextDto {
  @IsString()
  @IsNotEmpty()
  en: string;

  @IsString()
  @IsNotEmpty()
  ka: string;

  @IsString()
  @IsOptional()
  ru?: string;
}

export class PriceRangeDto {
  @IsNumber()
  @Min(0)
  min: number;

  @IsNumber()
  @IsOptional()
  max?: number;
}

export class CatalogServiceDto {
  @IsString()
  @IsNotEmpty()
  key: string;

  @ValidateNested()
  @Type(() => LocalizedTextDto)
  label: LocalizedTextDto;

  @ValidateNested()
  @Type(() => LocalizedTextDto)
  @IsOptional()
  description?: LocalizedTextDto;

  @IsNumber()
  @Min(0)
  basePrice: number;

  @IsEnum(ServiceUnit)
  unit: ServiceUnit;

  @ValidateNested()
  @Type(() => LocalizedTextDto)
  unitLabel: LocalizedTextDto;

  @IsNumber()
  @IsOptional()
  maxQuantity?: number;

  @IsNumber()
  @IsOptional()
  step?: number;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DiscountTierDto)
  @IsOptional()
  discountTiers?: DiscountTierDto[];
}

export class CatalogAddonDto {
  @IsString()
  @IsNotEmpty()
  key: string;

  @ValidateNested()
  @Type(() => LocalizedTextDto)
  label: LocalizedTextDto;

  @ValidateNested()
  @Type(() => LocalizedTextDto)
  promptLabel: LocalizedTextDto;

  @IsNumber()
  @Min(0)
  basePrice: number;

  @IsEnum(ServiceUnit)
  unit: ServiceUnit;

  @ValidateNested()
  @Type(() => LocalizedTextDto)
  unitLabel: LocalizedTextDto;

  @IsString()
  @IsOptional()
  iconName?: string;
}

export class CatalogVariantDto {
  @IsString()
  @IsNotEmpty()
  key: string;

  @ValidateNested()
  @Type(() => LocalizedTextDto)
  label: LocalizedTextDto;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CatalogServiceDto)
  services: CatalogServiceDto[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CatalogAddonDto)
  @IsOptional()
  addons?: CatalogAddonDto[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CatalogServiceDto)
  @IsOptional()
  additionalServices?: CatalogServiceDto[];
}

export class CatalogSubcategoryDto {
  @IsString()
  @IsNotEmpty()
  key: string;

  @ValidateNested()
  @Type(() => LocalizedTextDto)
  label: LocalizedTextDto;

  @ValidateNested()
  @Type(() => LocalizedTextDto)
  @IsOptional()
  description?: LocalizedTextDto;

  @IsString()
  @IsNotEmpty()
  iconName: string;

  @IsString()
  @IsOptional()
  imageUrl?: string;

  @ValidateNested()
  @Type(() => PriceRangeDto)
  priceRange: PriceRangeDto;

  @IsNumber()
  @IsOptional()
  sortOrder?: number;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CatalogVariantDto)
  @IsOptional()
  variants?: CatalogVariantDto[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CatalogServiceDto)
  @IsOptional()
  services?: CatalogServiceDto[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CatalogAddonDto)
  @IsOptional()
  addons?: CatalogAddonDto[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CatalogServiceDto)
  @IsOptional()
  additionalServices?: CatalogServiceDto[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DiscountTierDto)
  @IsOptional()
  orderDiscountTiers?: DiscountTierDto[];
}

export class CreateCatalogCategoryDto {
  @IsString()
  @IsNotEmpty()
  key: string;

  @ValidateNested()
  @Type(() => LocalizedTextDto)
  label: LocalizedTextDto;

  @ValidateNested()
  @Type(() => LocalizedTextDto)
  @IsOptional()
  description?: LocalizedTextDto;

  @IsString()
  @IsNotEmpty()
  iconName: string;

  @IsString()
  @IsNotEmpty()
  color: string;

  @IsNumber()
  @Min(0)
  minPrice: number;

  @IsNumber()
  @IsOptional()
  sortOrder?: number;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CatalogSubcategoryDto)
  subcategories: CatalogSubcategoryDto[];
}
