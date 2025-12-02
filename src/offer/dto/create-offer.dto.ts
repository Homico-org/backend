import { IsMongoId, IsNumber, IsString, IsOptional, IsDateString, Min } from 'class-validator';

export class CreateOfferDto {
  @IsMongoId()
  projectRequestId: string;

  @IsNumber()
  @Min(0)
  priceEstimate: number;

  @IsString()
  @IsOptional()
  currency?: string;

  @IsDateString()
  @IsOptional()
  estimatedStartDate?: Date;

  @IsNumber()
  @IsOptional()
  estimatedDurationDays?: number;

  @IsString()
  @IsOptional()
  description?: string;

  @IsDateString()
  @IsOptional()
  expiresAt?: Date;
}
