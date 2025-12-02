import { IsString, IsNumber, IsOptional, IsDateString, IsArray, IsMongoId } from 'class-validator';

export class CreateProjectRequestDto {
  @IsString()
  category: string;

  @IsString()
  title: string;

  @IsString()
  description: string;

  @IsString()
  location: string;

  @IsString()
  @IsOptional()
  address?: string;

  @IsNumber()
  @IsOptional()
  budgetMin?: number;

  @IsNumber()
  @IsOptional()
  budgetMax?: number;

  @IsString()
  @IsOptional()
  currency?: string;

  @IsDateString()
  @IsOptional()
  estimatedStartDate?: Date;

  @IsDateString()
  @IsOptional()
  estimatedEndDate?: Date;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  photos?: string[];

  @IsMongoId()
  @IsOptional()
  proId?: string;
}
