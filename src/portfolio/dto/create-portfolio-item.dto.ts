import { IsString, IsArray, IsOptional, IsDateString, IsNumber, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

class BeforeAfterPairDto {
  @IsString()
  before: string;

  @IsString()
  after: string;
}

export class CreatePortfolioItemDto {
  @IsString()
  title: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @IsOptional()
  imageUrl?: string;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  images?: string[];

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  videos?: string[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BeforeAfterPairDto)
  @IsOptional()
  beforeAfter?: BeforeAfterPairDto[];

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  tags?: string[];

  @IsDateString()
  @IsOptional()
  projectDate?: Date;

  @IsString()
  @IsOptional()
  location?: string;

  @IsNumber()
  @IsOptional()
  displayOrder?: number;
}
