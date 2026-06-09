import {
  IsString,
  IsNumber,
  IsOptional,
  IsDateString,
  IsArray,
  IsBoolean,
  IsEnum,
  ValidateNested,
  ArrayMaxSize,
  MaxLength,
} from 'class-validator';
import { Type } from 'class-transformer';
import {
  ApprovalStatus,
  DesignPhase,
  DocumentCategory,
  EngagementMode,
  EngagementStatus,
  MilestoneStatus,
  ProductStatus,
  ProjectPhase,
  ProjectStatus,
  SelectionOptionType,
  SelectionStatus,
} from '../schemas/project-request.schema';

export class SelectionOptionDto {
  @IsEnum(SelectionOptionType)
  @IsOptional()
  type?: SelectionOptionType;

  @IsString()
  name: string;

  @IsString()
  @IsOptional()
  colorHex?: string;

  @IsString()
  @IsOptional()
  imageUrl?: string;

  @IsString()
  @IsOptional()
  brand?: string;

  @IsString()
  @IsOptional()
  product?: string;

  @IsNumber()
  @IsOptional()
  price?: number;

  @IsString()
  @IsOptional()
  vendor?: string;

  @IsString()
  @IsOptional()
  url?: string;

  @IsString()
  @IsOptional()
  note?: string;
}

export class CreateSelectionDto {
  @IsString()
  title: string;

  @IsString()
  @IsOptional()
  roomId?: string;

  @IsString()
  @IsOptional()
  surface?: string;

  @IsEnum(ProjectPhase)
  @IsOptional()
  phase?: ProjectPhase;

  @IsString()
  @IsOptional()
  note?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SelectionOptionDto)
  @IsOptional()
  options?: SelectionOptionDto[];
}

export class UpdateSelectionDto {
  @IsString()
  @IsOptional()
  title?: string;

  @IsString()
  @IsOptional()
  roomId?: string;

  @IsString()
  @IsOptional()
  surface?: string;

  @IsEnum(ProjectPhase)
  @IsOptional()
  phase?: ProjectPhase;

  @IsString()
  @IsOptional()
  note?: string;
}

export class CreateRoomDto {
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
  wallArea?: number;

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

export class UpdateRoomDto {
  @IsString()
  @IsOptional()
  name?: string;

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
  wallArea?: number;

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

export class CreateScopeItemDto {
  @IsString()
  name: string;

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

export class UpdateScopeItemDto {
  @IsString()
  @IsOptional()
  name?: string;

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

export class ChooseSelectionDto {
  @IsString()
  chosenOptionId: string;
}

export class ReviewSelectionDto {
  @IsEnum(SelectionStatus)
  status: SelectionStatus;

  @IsString()
  @IsOptional()
  note?: string;
}

export class UpdateProjectDto {
  @IsString()
  @IsOptional()
  title?: string;

  @IsString()
  @IsOptional()
  coverImage?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @IsOptional()
  location?: string;

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
  estimatedStartDate?: string;

  @IsDateString()
  @IsOptional()
  estimatedEndDate?: string;

  @IsEnum(ProjectStatus)
  @IsOptional()
  status?: ProjectStatus;

  @IsString()
  @IsOptional()
  cadastralId?: string;

  @IsNumber()
  @IsOptional()
  landArea?: number;

  @IsNumber()
  @IsOptional()
  floorCount?: number;

  @IsString()
  @IsOptional()
  propertyType?: string;
}

export class AddEngagementDto {
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

  @IsEnum(ProjectPhase)
  @IsOptional()
  phase?: ProjectPhase;

  // Optional pointer to a user-defined step on the project.
  @IsString()
  @IsOptional()
  stepId?: string;
}

export class UpdateEngagementDto {
  @IsString()
  @IsOptional()
  roleLabel?: string;

  @IsString()
  @IsOptional()
  scope?: string;

  @IsNumber()
  @IsOptional()
  budget?: number;

  @IsEnum(EngagementMode)
  @IsOptional()
  mode?: EngagementMode;

  @IsEnum(EngagementStatus)
  @IsOptional()
  status?: EngagementStatus;

  @IsEnum(ProjectPhase)
  @IsOptional()
  phase?: ProjectPhase;

  // Pass `null` to detach the engagement from its step.
  @IsString()
  @IsOptional()
  stepId?: string | null;

  // Client-only: grant/revoke project manage (editor) rights for this pro.
  @IsBoolean()
  @IsOptional()
  canManage?: boolean;
}

// === Project step DTOs ===

export class AddStepDto {
  @IsString()
  name: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @IsOptional()
  color?: string;
}

export class UpdateStepDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @IsOptional()
  color?: string;
}

export class ReorderStepsDto {
  // Ordered list of step ids; index in array becomes the step's `order`.
  @IsString({ each: true })
  orderedIds: string[];
}

export class AddDocumentDto {
  @IsString()
  name: string;

  @IsString()
  url: string;

  @IsString()
  @IsOptional()
  stepId?: string;

  @IsString()
  @IsOptional()
  roomId?: string;

  @IsString()
  @IsOptional()
  group?: string;

  @IsString()
  @IsOptional()
  fileType?: string;

  @IsEnum(DocumentCategory)
  @IsOptional()
  category?: DocumentCategory;

  @IsEnum(ProjectPhase)
  @IsOptional()
  phase?: ProjectPhase;

  @IsString()
  @IsOptional()
  engagementId?: string;

  @IsString()
  @IsOptional()
  note?: string;
}

export class ApproveDocumentDto {
  @IsEnum(ApprovalStatus)
  status: ApprovalStatus;

  @IsString()
  @IsOptional()
  note?: string;
}

export class AddDocumentVersionDto {
  @IsString()
  url: string;

  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  fileType?: string;
}

export class AddDocumentCommentDto {
  @IsString()
  text: string;

  @IsString()
  @IsOptional()
  authorName?: string;

  // Optional image-markup pin (fractions 0-1 of width/height).
  @IsNumber()
  @IsOptional()
  x?: number;

  @IsNumber()
  @IsOptional()
  y?: number;
}

export class AddDecisionDto {
  @IsString()
  text: string;

  @IsString()
  @IsOptional()
  decidedByName?: string;
}

export class DesignPhaseDto {
  @IsEnum(DesignPhase)
  @IsOptional()
  phase?: DesignPhase;

  @IsEnum(ApprovalStatus)
  @IsOptional()
  status?: ApprovalStatus;

  @IsString()
  @IsOptional()
  note?: string;
}

export class AddProductDto {
  @IsString()
  name: string;

  @IsNumber()
  @IsOptional()
  qty?: number;

  @IsNumber()
  @IsOptional()
  unitPrice?: number;

  @IsString()
  @IsOptional()
  vendor?: string;

  @IsString()
  @IsOptional()
  url?: string;

  @IsString()
  @IsOptional()
  imageUrl?: string;

  // Catalog link (set when added from the supplier catalog) so the row can
  // be ordered through checkout.
  @IsString()
  @IsOptional()
  supplierProductId?: string;

  @IsString()
  @IsOptional()
  supplierKey?: string;

  @IsEnum(ProjectPhase)
  @IsOptional()
  phase?: ProjectPhase;

  @IsString()
  @IsOptional()
  engagementId?: string;

  @IsString()
  @IsOptional()
  roomId?: string;

  @IsString()
  @IsOptional()
  stepId?: string;

  @IsString()
  @IsOptional()
  category?: string;

  @IsEnum(ProductStatus)
  @IsOptional()
  status?: ProductStatus;

  @IsString()
  @IsOptional()
  note?: string;
}

export class UpdateProductDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsNumber()
  @IsOptional()
  qty?: number;

  @IsNumber()
  @IsOptional()
  unitPrice?: number;

  @IsString()
  @IsOptional()
  vendor?: string;

  @IsString()
  @IsOptional()
  url?: string;

  @IsString()
  @IsOptional()
  imageUrl?: string;

  // Catalog link (set when added from the supplier catalog) so the row can
  // be ordered through checkout.
  @IsString()
  @IsOptional()
  supplierProductId?: string;

  @IsString()
  @IsOptional()
  supplierKey?: string;

  @IsEnum(ProjectPhase)
  @IsOptional()
  phase?: ProjectPhase;

  @IsString()
  @IsOptional()
  engagementId?: string;

  @IsString()
  @IsOptional()
  roomId?: string;

  @IsString()
  @IsOptional()
  stepId?: string;

  @IsString()
  @IsOptional()
  category?: string;

  @IsEnum(ProductStatus)
  @IsOptional()
  status?: ProductStatus;

  @IsString()
  @IsOptional()
  note?: string;
}

export class AddMilestoneDto {
  @IsString()
  title: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsDateString()
  @IsOptional()
  dueDate?: string;

  @IsString()
  @IsOptional()
  phase?: string;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  linkedEngagementIds?: string[];
}

export class UpdateMilestoneDto {
  @IsString()
  @IsOptional()
  title?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsDateString()
  @IsOptional()
  dueDate?: string;

  @IsEnum(MilestoneStatus)
  @IsOptional()
  status?: MilestoneStatus;

  @IsNumber()
  @IsOptional()
  sortOrder?: number;

  @IsString()
  @IsOptional()
  phase?: string;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  linkedEngagementIds?: string[];
}

// === Moodboard ===
export class AddMoodboardItemDto {
  @IsString()
  imageUrl: string;

  @IsString()
  @IsOptional()
  title?: string;

  @IsString()
  @IsOptional()
  sourceUrl?: string;

  @IsString()
  @IsOptional()
  note?: string;
}

export class UpdateMoodboardItemDto {
  @IsString()
  @IsOptional()
  title?: string;

  @IsString()
  @IsOptional()
  note?: string;
}

// Pull an inspiration image from any pasted link (Pinterest pin, store page,
// blog) by reading its og:image server-side.
export class MoodboardFromUrlDto {
  @IsString()
  url: string;
}

// One imported line from an estimate / bill of works (an Excel row, already
// parsed + service-matched on the client). `serviceKey` is set when the row
// was matched to a catalog service; absent = a free-text line item.
export class ImportEstimateItemDto {
  @IsString()
  @MaxLength(300)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  stepName?: string;

  @IsOptional()
  @IsString()
  serviceKey?: string;

  @IsOptional()
  @IsString()
  categoryKey?: string;

  @IsOptional()
  @IsNumber()
  quantity?: number;

  @IsOptional()
  @IsString()
  unit?: string;

  @IsOptional()
  @IsString()
  unitLabel?: string;

  @IsOptional()
  @IsNumber()
  unitPrice?: number;
}

export class ImportEstimateDto {
  // Explicit ordered step names to ensure exist (in addition to any referenced
  // by items). Items without a stepName land unassigned.
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(100)
  steps?: string[];

  @IsArray()
  @ArrayMaxSize(1000)
  @ValidateNested({ each: true })
  @Type(() => ImportEstimateItemDto)
  items: ImportEstimateItemDto[];
}
