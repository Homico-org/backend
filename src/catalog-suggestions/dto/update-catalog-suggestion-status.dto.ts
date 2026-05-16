import { IsEnum, IsOptional, IsString, Length } from "class-validator";

export class UpdateCatalogSuggestionStatusDto {
  @IsEnum(["pending", "approved", "rejected"])
  status: "pending" | "approved" | "rejected";

  @IsOptional()
  @IsString()
  @Length(0, 500)
  reviewerNote?: string;
}
