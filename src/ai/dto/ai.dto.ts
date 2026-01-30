import { IsString, IsNumber, IsBoolean, IsEnum, IsArray, ValidateNested, IsOptional, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class AnalyzeEstimateDto {
  @ApiProperty({ description: 'The contractor estimate text to analyze' })
  @IsString()
  estimateText: string;

  @ApiPropertyOptional({ description: 'Language for response', enum: ['en', 'ka', 'ru'], default: 'en' })
  @IsOptional()
  @IsString()
  locale?: string;
}

export enum RenovationType {
  COSMETIC = 'cosmetic',
  STANDARD = 'standard',
  FULL = 'full',
  LUXURY = 'luxury',
}

export enum PropertyType {
  APARTMENT = 'apartment',
  HOUSE = 'house',
}

export class CalculateRenovationDto {
  @ApiProperty({ description: 'Area in square meters', minimum: 1 })
  @IsNumber()
  @Min(1)
  area: number;

  @ApiProperty({ description: 'Number of rooms', minimum: 1 })
  @IsNumber()
  @Min(1)
  rooms: number;

  @ApiProperty({ description: 'Number of bathrooms', minimum: 0 })
  @IsNumber()
  @Min(0)
  bathrooms: number;

  @ApiProperty({ enum: RenovationType, description: 'Type of renovation' })
  @IsEnum(RenovationType)
  renovationType: RenovationType;

  @ApiProperty({ description: 'Include kitchen renovation' })
  @IsBoolean()
  includeKitchen: boolean;

  @ApiProperty({ description: 'Include furniture' })
  @IsBoolean()
  includeFurniture: boolean;

  @ApiProperty({ enum: PropertyType, description: 'Type of property' })
  @IsEnum(PropertyType)
  propertyType: PropertyType;

  @ApiPropertyOptional({ description: 'Language for response', enum: ['en', 'ka', 'ru'], default: 'en' })
  @IsOptional()
  @IsString()
  locale?: string;
}

export class EstimateItemDto {
  @ApiProperty({ description: 'Contractor/estimate name' })
  @IsString()
  name: string;

  @ApiProperty({ description: 'Estimate content/text' })
  @IsString()
  content: string;
}

export class CompareEstimatesDto {
  @ApiProperty({ type: [EstimateItemDto], description: 'Array of estimates to compare (2-5)' })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => EstimateItemDto)
  estimates: EstimateItemDto[];

  @ApiPropertyOptional({ description: 'Language for response', enum: ['en', 'ka', 'ru'], default: 'en' })
  @IsOptional()
  @IsString()
  locale?: string;
}

export class GetPriceInfoDto {
  @ApiProperty({ description: 'Item to get price info for' })
  @IsString()
  item: string;

  @ApiPropertyOptional({ description: 'Language for response', enum: ['en', 'ka', 'ru'], default: 'en' })
  @IsOptional()
  @IsString()
  locale?: string;
}

export class ChatMessageDto {
  @ApiProperty({ enum: ['user', 'assistant'], description: 'Message role' })
  @IsString()
  role: 'user' | 'assistant';

  @ApiProperty({ description: 'Message content' })
  @IsString()
  content: string;
}

export class ChatDto {
  @ApiProperty({ type: [ChatMessageDto], description: 'Conversation messages' })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ChatMessageDto)
  messages: ChatMessageDto[];

  @ApiPropertyOptional({ description: 'Language for response', enum: ['en', 'ka', 'ru'], default: 'en' })
  @IsOptional()
  @IsString()
  locale?: string;
}
