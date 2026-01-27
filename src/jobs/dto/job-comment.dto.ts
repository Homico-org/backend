import { IsString, IsOptional, IsBoolean, IsArray, MaxLength, IsMongoId } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateJobCommentDto {
  @ApiProperty({ description: 'Comment content', maxLength: 2000 })
  @IsString()
  @MaxLength(2000)
  content: string;

  @ApiPropertyOptional({ description: 'Phone number to share' })
  @IsOptional()
  @IsString()
  phoneNumber?: string;

  @ApiPropertyOptional({ description: 'Portfolio item IDs to showcase' })
  @IsOptional()
  @IsArray()
  @IsMongoId({ each: true })
  portfolioItems?: string[];

  @ApiPropertyOptional({ description: 'Whether to show profile link', default: true })
  @IsOptional()
  @IsBoolean()
  showProfile?: boolean;

  @ApiPropertyOptional({ description: 'Parent comment ID for replies' })
  @IsOptional()
  @IsMongoId()
  parentId?: string;
}

export class UpdateJobCommentDto {
  @ApiPropertyOptional({ description: 'Updated comment content', maxLength: 2000 })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  content?: string;

  @ApiPropertyOptional({ description: 'Phone number to share' })
  @IsOptional()
  @IsString()
  phoneNumber?: string;

  @ApiPropertyOptional({ description: 'Portfolio item IDs to showcase' })
  @IsOptional()
  @IsArray()
  @IsMongoId({ each: true })
  portfolioItems?: string[];

  @ApiPropertyOptional({ description: 'Whether to show profile link' })
  @IsOptional()
  @IsBoolean()
  showProfile?: boolean;
}

export class MarkInterestingDto {
  @ApiProperty({ description: 'Whether to mark as interesting' })
  @IsBoolean()
  isInteresting: boolean;
}
