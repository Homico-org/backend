import {
  IsString,
  IsNumber,
  IsOptional,
  IsDateString,
  IsArray,
  IsMongoId,
  IsEnum,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { EngagementMode } from '../schemas/project-request.schema';

export class CreateEngagementDto {
  @IsString()
  @IsOptional()
  id?: string;

  @IsString()
  roleKey: string;

  @IsString()
  roleLabel: string;

  @IsString()
  @IsOptional()
  scope?: string;

  @IsNumber()
  @IsOptional()
  budget?: number;

  @IsEnum(EngagementMode)
  @IsOptional()
  mode?: EngagementMode;
}

export class CreateMilestoneDto {
  @IsString()
  @IsOptional()
  id?: string;

  @IsString()
  title: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsDateString()
  @IsOptional()
  dueDate?: string;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  linkedEngagementIds?: string[];
}

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

  @IsString()
  @IsOptional()
  coverImage?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateEngagementDto)
  @IsOptional()
  engagements?: CreateEngagementDto[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateMilestoneDto)
  @IsOptional()
  milestones?: CreateMilestoneDto[];

  @IsMongoId()
  @IsOptional()
  proId?: string;

  // === Site info (architecture projects) ===
  @IsString()
  @IsOptional()
  cadastralId?: string;

  @IsNumber()
  @IsOptional()
  landArea?: number;

  @IsNumber()
  @IsOptional()
  floorCount?: number;
}
