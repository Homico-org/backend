import { IsString, IsNotEmpty, IsEnum, IsOptional, IsNumber, IsArray, IsDateString, IsBoolean, ValidateNested } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { JobBudgetType, JobSizeUnit, JobPropertyType, JobType } from '../schemas/job.schema';

export class JobAddressDto {
  @ApiProperty({ example: '12 Rustaveli Ave, Tbilisi, Georgia' })
  @IsString()
  @IsNotEmpty()
  formattedAddress: string;

  @ApiProperty({ example: 41.7151 })
  @IsNumber()
  lat: number;

  @ApiProperty({ example: 44.8271 })
  @IsNumber()
  lng: number;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  apartment?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  floor?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  entrance?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  notes?: string;
}

class ReferenceDto {
  @ApiProperty({ enum: ['link', 'image', 'pinterest', 'instagram'] })
  @IsString()
  type: 'link' | 'image' | 'pinterest' | 'instagram';

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  url: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  title?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  thumbnail?: string;
}

class ServiceItemDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  key: string;

  @ApiProperty()
  @IsNumber()
  quantity: number;

  @ApiProperty()
  @IsNumber()
  unitPrice: number;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  unit?: string;
}

export class CreateJobDto {
  @ApiPropertyOptional({ enum: JobType, description: 'Job type: marketplace or direct_request' })
  @IsEnum(JobType)
  @IsOptional()
  jobType?: JobType;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  title: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  description: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  category: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  subcategory?: string;

  @ApiProperty({ required: false })
  @IsArray()
  @IsOptional()
  skills?: string[];

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  location?: string;

  @ApiPropertyOptional({ description: 'Structured address with coordinates' })
  @ValidateNested()
  @Type(() => JobAddressDto)
  @IsOptional()
  address?: JobAddressDto;

  @ApiPropertyOptional({ enum: JobPropertyType })
  @IsEnum(JobPropertyType)
  @IsOptional()
  propertyType?: JobPropertyType;

  @ApiPropertyOptional({ description: 'Custom property type when propertyType is "other"' })
  @IsString()
  @IsOptional()
  propertyTypeOther?: string;

  // Area/Size specifications
  @ApiProperty({ required: false })
  @IsNumber()
  @IsOptional()
  areaSize?: number;

  @ApiProperty({ enum: JobSizeUnit, required: false })
  @IsEnum(JobSizeUnit)
  @IsOptional()
  sizeUnit?: JobSizeUnit;

  @ApiProperty({ required: false })
  @IsNumber()
  @IsOptional()
  roomCount?: number;

  // Budget specifications
  @ApiProperty({ enum: JobBudgetType })
  @IsEnum(JobBudgetType)
  budgetType: JobBudgetType;

  @ApiProperty({ required: false })
  @IsNumber()
  @IsOptional()
  budgetAmount?: number;

  @ApiProperty({ required: false })
  @IsNumber()
  @IsOptional()
  budgetMin?: number;

  @ApiProperty({ required: false })
  @IsNumber()
  @IsOptional()
  budgetMax?: number;

  @ApiProperty({ required: false })
  @IsNumber()
  @IsOptional()
  pricePerUnit?: number;

  @ApiProperty({ required: false })
  @IsDateString()
  @IsOptional()
  deadline?: string;

  @ApiProperty({ required: false })
  @IsArray()
  @IsOptional()
  images?: string[];

  // ====== ARCHITECTURE-SPECIFIC FIELDS ======
  @ApiPropertyOptional({ description: 'Cadastral registry ID' })
  @IsString()
  @IsOptional()
  cadastralId?: string;

  @ApiPropertyOptional({ description: 'Land plot size in square meters' })
  @IsNumber()
  @IsOptional()
  landArea?: number;

  @ApiPropertyOptional({ description: 'Number of floors' })
  @IsNumber()
  @IsOptional()
  floorCount?: number;

  // ====== WORK-SPECIFIC FIELDS ======
  @ApiPropertyOptional({ description: 'Number of electrical/plumbing/lighting points' })
  @IsNumber()
  @IsOptional()
  pointsCount?: number;

  @ApiPropertyOptional({ description: 'Project phase: concept, schematic, detailed, construction' })
  @IsString()
  @IsOptional()
  projectPhase?: string;

  @ApiPropertyOptional({ description: 'Building permit needed' })
  @IsBoolean()
  @IsOptional()
  permitRequired?: boolean;

  @ApiPropertyOptional({ description: 'Current condition: empty land, old building, etc.' })
  @IsString()
  @IsOptional()
  currentCondition?: string;

  @ApiPropertyOptional({ description: 'Zoning type: residential, commercial, mixed' })
  @IsString()
  @IsOptional()
  zoningType?: string;

  // ====== INTERIOR DESIGN-SPECIFIC FIELDS ======
  @ApiPropertyOptional({ description: 'Design style: modern, minimalist, classic, etc.' })
  @IsString()
  @IsOptional()
  designStyle?: string;

  @ApiPropertyOptional({ description: 'Rooms to design' })
  @IsArray()
  @IsOptional()
  roomsToDesign?: string[];

  @ApiPropertyOptional({ description: 'Need furniture selection/purchase' })
  @IsBoolean()
  @IsOptional()
  furnitureIncluded?: boolean;

  @ApiPropertyOptional({ description: '3D renders needed' })
  @IsBoolean()
  @IsOptional()
  visualizationNeeded?: boolean;

  @ApiPropertyOptional({ description: 'Design references (links, images, pinterest, instagram)' })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ReferenceDto)
  @IsOptional()
  references?: ReferenceDto[];

  @ApiPropertyOptional({ description: 'Preferred colors' })
  @IsArray()
  @IsOptional()
  preferredColors?: string[];

  @ApiPropertyOptional({ description: 'Existing furniture: keep all, keep some, replace all' })
  @IsString()
  @IsOptional()
  existingFurniture?: string;

  // ====== RENOVATION/CONSTRUCTION-SPECIFIC FIELDS ======
  @ApiPropertyOptional({ description: 'Work types: demolition, walls, electrical, plumbing, etc.' })
  @IsArray()
  @IsOptional()
  workTypes?: string[];

  @ApiPropertyOptional({ description: 'Client provides materials' })
  @IsBoolean()
  @IsOptional()
  materialsProvided?: boolean;

  @ApiPropertyOptional({ description: 'Notes about materials' })
  @IsString()
  @IsOptional()
  materialsNote?: string;

  @ApiPropertyOptional({ description: 'Will client live there during work' })
  @IsBoolean()
  @IsOptional()
  occupiedDuringWork?: boolean;

  @ApiPropertyOptional({ description: 'Services selected (for direct_request jobs)' })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ServiceItemDto)
  @IsOptional()
  services?: ServiceItemDto[];

  @ApiPropertyOptional({ description: 'Professional IDs to invite' })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  invitedPros?: string[];
}
