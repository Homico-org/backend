import { IsString, IsArray, IsOptional, IsDateString, IsNumber } from 'class-validator';

export class CreatePortfolioItemDto {
  @IsString()
  title: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  imageUrl: string;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  tags?: string[];

  @IsDateString()
  @IsOptional()
  projectDate?: Date;

  @IsString()
  @IsOptional()
  location?: string;

  @IsNumber()
  @IsOptional()
  displayOrder?: number;
}
