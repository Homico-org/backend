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

// A space/room supplied at project-creation time. `id` is optional and, when
// present, is preserved on the saved doc so scope items can cross-link to it
// (same pattern as CreateEngagementDto.id).
export class CreateRoomEntryDto {
  @IsString()
  @IsOptional()
  id?: string;

  @IsString()
  name: string;

  @IsNumber()
  @IsOptional()
  length?: number;

  @IsNumber()
  @IsOptional()
  width?: number;

  @IsNumber()
  @IsOptional()
  height?: number;

  @IsNumber()
  @IsOptional()
  area?: number;

  @IsNumber()
  @IsOptional()
  budget?: number;

  @IsString()
  @IsOptional()
  note?: string;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  photos?: string[];
}

// A project step supplied at creation time. `order` is assigned server-side
// from array index; the client only sends name/description/color (+ optional id).
export class CreateStepEntryDto {
  @IsString()
  @IsOptional()
  id?: string;

  @IsString()
  name: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @IsOptional()
  color?: string;
}

// A scope item (service) supplied at creation time. roomId/stepId/engagementId
// reference the client-supplied ids of rooms/steps/engagements in the same
// payload, so the cross-links survive the single atomic create.
export class CreateScopeItemEntryDto {
  @IsString()
  @IsOptional()
  id?: string;

  @IsString()
  @IsOptional()
  roomId?: string;

  @IsString()
  @IsOptional()
  stepId?: string;

  @IsString()
  @IsOptional()
  categoryKey?: string;

  @IsString()
  @IsOptional()
  serviceKey?: string;

  @IsString()
  name: string;

  @IsNumber()
  @IsOptional()
  quantity?: number;

  @IsString()
  @IsOptional()
  unit?: string;

  @IsString()
  @IsOptional()
  unitLabel?: string;

  @IsNumber()
  @IsOptional()
  unitPrice?: number;

  @IsString()
  @IsOptional()
  engagementId?: string;

  @IsString()
  @IsOptional()
  note?: string;
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

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateRoomEntryDto)
  @IsOptional()
  rooms?: CreateRoomEntryDto[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateStepEntryDto)
  @IsOptional()
  steps?: CreateStepEntryDto[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateScopeItemEntryDto)
  @IsOptional()
  scopeItems?: CreateScopeItemEntryDto[];

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
