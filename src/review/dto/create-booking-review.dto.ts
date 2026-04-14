import { IsNumber, IsString, IsOptional, IsArray, Min, Max } from 'class-validator';

export class CreateBookingReviewDto {
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
