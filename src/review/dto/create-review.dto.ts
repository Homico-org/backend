import { IsMongoId, IsNumber, IsString, IsOptional, IsArray, Min, Max } from 'class-validator';

export class CreateReviewDto {
  // Legacy field - kept for backwards compatibility
  @IsMongoId()
  @IsOptional()
  projectId?: string;

  // New field - reference to Job
  @IsMongoId()
  @IsOptional()
  jobId?: string;

  @IsMongoId()
  proId: string;

  @IsNumber()
  @Min(1)
  @Max(5)
  rating: number;

  @IsString()
  @IsOptional()
  text?: string;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  photos?: string[];
}
