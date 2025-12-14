import { IsString, IsArray, IsNumber, IsEnum, IsOptional, Min, IsBoolean, IsUrl, ValidateNested } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { PricingModel } from '../schemas/pro-profile.schema';

class BeforeAfterPairDto {
  @IsString()
  @IsOptional()
  id?: string;

  @IsString()
  beforeImage: string;

  @IsString()
  afterImage: string;
}

class PortfolioProjectDto {
  @IsString()
  @IsOptional()
  id?: string;

  @IsString()
  title: string;

  @IsString()
  description: string;

  @IsString()
  @IsOptional()
  location?: string;

  @IsArray()
  @IsString({ each: true })
  images: string[];

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  videos?: string[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BeforeAfterPairDto)
  @IsOptional()
  beforeAfterPairs?: BeforeAfterPairDto[];
}

export class CreateProProfileDto {
  @IsString()
  @IsOptional()
  title?: string;

  @IsString()
  @IsOptional()
  companyName?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  categories?: string[];

  @ApiPropertyOptional({
    description: 'Selected subcategories/specializations',
    example: ['interior', 'exterior', '3d-visualization'],
  })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  subcategories?: string[];

  @IsNumber()
  @Min(0)
  @IsOptional()
  yearsExperience?: number;

  @IsArray()
  @IsString({ each: true })
  serviceAreas: string[];

  @IsEnum(PricingModel)
  @IsOptional()
  pricingModel?: PricingModel;

  @IsNumber()
  @IsOptional()
  basePrice?: number;

  @IsString()
  @IsOptional()
  currency?: string;

  @IsString()
  @IsOptional()
  coverImage?: string;

  @IsString()
  @IsOptional()
  tagline?: string;

  @IsString()
  @IsOptional()
  bio?: string;

  @IsString()
  @IsOptional()
  avatar?: string;

  @IsString()
  @IsOptional()
  profileType?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PortfolioProjectDto)
  @IsOptional()
  portfolioProjects?: PortfolioProjectDto[];

  // Interior Designer specific fields
  @ApiPropertyOptional({
    description: 'Pinterest board/pin URLs for portfolio (Interior Designers)',
    example: ['https://pinterest.com/user/board1', 'https://pinterest.com/pin/123'],
  })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  pinterestLinks?: string[];

  @ApiPropertyOptional({
    description: 'Portfolio image URLs (Interior Designers)',
  })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  portfolioImages?: string[];

  @ApiPropertyOptional({
    description: 'Design style (Interior Designers)',
    example: 'Modern',
  })
  @IsString()
  @IsOptional()
  designStyle?: string;

  // Architect specific fields
  @ApiPropertyOptional({
    description: 'Cadastral ID from Public Service Hall (Architects)',
    example: '01.18.01.004.001',
  })
  @IsString()
  @IsOptional()
  cadastralId?: string;

  @ApiPropertyOptional({
    description: 'Professional architect license number',
  })
  @IsString()
  @IsOptional()
  architectLicenseNumber?: string;

  @ApiPropertyOptional({
    description: 'References to completed building projects (Architects)',
  })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  completedProjects?: string[];
}
