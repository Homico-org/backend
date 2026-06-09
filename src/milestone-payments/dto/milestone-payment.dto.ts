import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

/** One installment line in a proposed schedule. Amount is in GEL (major). */
export class ProposeMilestoneItemDto {
  @IsString()
  @MaxLength(120)
  label: string;

  /** Amount the client pays, in GEL (major units). Converted to tetri server-side. */
  @IsNumber()
  @Min(1)
  amount: number;
}

export class ProposeScheduleDto {
  @IsString()
  projectId: string;

  @IsString()
  engagementId: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => ProposeMilestoneItemDto)
  items: ProposeMilestoneItemDto[];
}

export class ApproveScheduleDto {
  @IsString()
  projectId: string;

  @IsString()
  engagementId: string;
}

export class RaiseMilestoneDisputeDto {
  @IsIn(['quality', 'cancellation', 'other'])
  type: 'quality' | 'cancellation' | 'other';

  @IsString()
  @MaxLength(2000)
  description: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  evidenceUrls?: string[];
}
