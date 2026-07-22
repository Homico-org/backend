import {
  IsArray,
  IsBoolean,
  IsObject,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';

/**
 * Client-side approval. `password` logs an existing account in (matched by the
 * draft's phone) or sets the password for a freshly created one. A handful of
 * fields may be corrected by the client before the job is created.
 */
export class ApproveAssistedJobDto {
  // Explicit consent — a third party (the admin) entered the client's data.
  @IsBoolean()
  consent: boolean;

  @IsOptional()
  @IsString()
  @MinLength(6)
  password?: string;

  // ── Optional client edits (only these fields are editable) ──
  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  location?: string;

  @IsOptional()
  @IsObject()
  coordinates?: { lat: number; lng: number };

  @IsOptional()
  @IsString()
  areaSize?: string;

  @IsOptional()
  @IsString()
  budgetMin?: string;

  @IsOptional()
  @IsString()
  budgetMax?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  images?: string[];
}
