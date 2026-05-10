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
import {
  PricingModel,
  ServiceType,
  ServiceUnit,
} from '../schemas/service-catalog.schema';

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

export class ServicePriceRangeDto {
  @IsNumber()
  @Min(0)
  min: number;

  @IsNumber()
  @IsOptional()
  typical?: number;

  @IsNumber()
  @Min(0)
  max: number;
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

  @IsNumber()
  @IsOptional()
  maxPrice?: number;

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

  // === Optional flexibility fields (added 2026-05) ===

  @ValidateNested()
  @Type(() => ServicePriceRangeDto)
  @IsOptional()
  priceRange?: ServicePriceRangeDto;

  @IsEnum(PricingModel)
  @IsOptional()
  pricingModel?: PricingModel;

  @IsEnum(ServiceType)
  @IsOptional()
  serviceType?: ServiceType;

  @IsNumber()
  @IsOptional()
  estimatedDurationMin?: number;

  @IsNumber()
  @IsOptional()
  estimatedDurationMax?: number;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  tags?: string[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => LocalizedTextDto)
  @IsOptional()
  keywords?: LocalizedTextDto[];

  @IsString()
  @IsOptional()
  imageUrl?: string;
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

  @IsNumber()
  @IsOptional()
  maxPrice?: number;

  @IsEnum(ServiceUnit)
  unit: ServiceUnit;

  @ValidateNested()
  @Type(() => LocalizedTextDto)
  unitLabel: LocalizedTextDto;

  @IsString()
  @IsOptional()
  iconName?: string;
}

// CatalogVariantDto was removed in the 2026-05 stabilization pass.

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

  // === Optional flexibility fields (added 2026-05) ===

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  tags?: string[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => LocalizedTextDto)
  @IsOptional()
  keywords?: LocalizedTextDto[];
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

  // === Optional flexibility fields (added 2026-05) ===

  @IsString()
  @IsOptional()
  imageUrl?: string;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  tags?: string[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => LocalizedTextDto)
  @IsOptional()
  keywords?: LocalizedTextDto[];
}
