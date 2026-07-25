import { Type } from 'class-transformer';
import {
  IsArray,
  IsMongoId,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';

class ClientContactDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsNotEmpty()
  phone: string;

  @IsOptional()
  @IsString()
  email?: string;
}

/**
 * Admin payload for pre-filling a job. Mirrors the fields captured by the
 * /admin/assisted-job page. Service/coordinate objects are stored as-is (they
 * are re-mapped to the Job shape only at approval time).
 */
export class CreateAssistedJobDto {
  @ValidateNested()
  @Type(() => ClientContactDto)
  client: ClientContactDto;

  @IsString()
  @IsNotEmpty()
  category: string;

  @IsOptional()
  @IsString()
  subcategory?: string;

  @IsOptional()
  @IsArray()
  services?: Record<string, unknown>[];

  @IsOptional()
  @IsString()
  propertyType?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  areaSize?: string;

  @IsOptional()
  @IsString()
  timing?: string;

  @IsOptional()
  @IsString()
  budgetType?: string;

  @IsOptional()
  @IsString()
  budgetMin?: string;

  @IsOptional()
  @IsString()
  budgetMax?: string;

  @IsString()
  @IsNotEmpty()
  location: string;

  @IsOptional()
  @IsObject()
  coordinates?: { lat: number; lng: number };

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  images?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  videos?: string[];

  // Optional: pro user IDs to invite directly (in addition to the marketplace).
  @IsOptional()
  @IsArray()
  @IsMongoId({ each: true })
  invitedPros?: string[];
}
