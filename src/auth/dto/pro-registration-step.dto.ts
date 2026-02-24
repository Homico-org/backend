import { IsNumber, IsString, IsOptional, IsArray, ValidateNested, IsBoolean } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

class ServicePricingItemDto {
  @IsString()
  serviceKey: string;

  @IsString()
  categoryKey: string;

  @IsString()
  subcategoryKey: string;

  @IsString()
  @IsOptional()
  variantKey?: string;

  @IsNumber()
  price: number;

  @IsBoolean()
  isActive: boolean;
}

export class ProRegistrationStepDto {
  @ApiProperty({ example: 2, description: 'Step number that was completed (2=profile, 3=categories, 4=pricing)' })
  @IsNumber()
  step: number;

  // Step 2 fields
  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  email?: string;

  @IsString()
  @IsOptional()
  city?: string;

  // Step 3 fields
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  selectedCategories?: string[];

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  selectedSubcategories?: string[];

  // Step 4 fields
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ServicePricingItemDto)
  @IsOptional()
  servicePricing?: ServicePricingItemDto[];
}
