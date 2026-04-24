import {
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from "class-validator";

export class CreateServiceRequestDto {
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  category: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  subcategory?: string;

  @IsString()
  @MinLength(5)
  @MaxLength(2000)
  description: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  cityKey?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  address?: string;

  @IsOptional()
  @IsIn(["asap", "this_week", "flexible"])
  timing?: "asap" | "this_week" | "flexible";

  @IsString()
  @MinLength(2)
  @MaxLength(80)
  name: string;

  // Loose phone validation — we normalize downstream. Georgian 9-digit or
  // full international. Don't reject, we'd rather store and call.
  @IsString()
  @MinLength(6)
  @MaxLength(20)
  phone: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsIn(["en", "ka", "ru"])
  locale?: "en" | "ka" | "ru";
}
