import {
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Length,
  Max,
  Min,
} from "class-validator";

export const CATALOG_SUGGESTION_UNITS = [
  "fixed",
  "hourly",
  "per_sqm",
  "per_item",
  "per_day",
  "per_visit",
  "byAgreement",
] as const;

export class CreateCatalogSuggestionDto {
  @IsString()
  @Length(2, 120)
  serviceName: string;

  @IsString()
  @Length(5, 1000)
  description: string;

  // Optional hints
  @IsOptional()
  @IsString()
  @Length(1, 80)
  suggestedCategoryKey?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100000)
  suggestedPrice?: number;

  @IsOptional()
  @IsEnum(CATALOG_SUGGESTION_UNITS)
  suggestedUnit?: (typeof CATALOG_SUGGESTION_UNITS)[number];

  @IsOptional()
  @IsString()
  @Length(1, 500)
  photoUrl?: string;

  @IsOptional()
  @IsString()
  @Length(2, 8)
  locale?: string;
}
