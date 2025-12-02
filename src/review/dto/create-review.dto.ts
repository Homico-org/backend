import { IsMongoId, IsNumber, IsString, IsOptional, IsArray, Min, Max } from 'class-validator';

export class CreateReviewDto {
  @IsMongoId()
  projectId: string;

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
