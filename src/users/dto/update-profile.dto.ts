import { ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from "class-validator";
import { PricingModel, ProStatus } from "../schemas/user.schema";

class BeforeAfterPairDto {
  @IsString()
  @IsOptional()
  id?: string;

  @IsString()
  beforeImage: string;

  @IsString()
  afterImage: string;
}

class SelectedServiceDto {
  @IsString()
  key: string;

  @IsString()
  categoryKey: string;

  @IsString()
  name: string;

  @IsString()
  nameKa: string;

  @IsString()
  experience: string; // '0-1', '1-3', '3-5', '5-10', '10+'
}

class WeeklyScheduleEntryDto {
  @IsNumber()
  dayOfWeek: number;

  @IsBoolean()
  isAvailable: boolean;

  @IsNumber()
  startHour: number;

  @IsNumber()
  endHour: number;
}

class ScheduleOverrideDto {
  @IsString()
  date: string;

  @IsBoolean()
  isBlocked: boolean;

  @IsNumber()
  @IsOptional()
  startHour?: number;

  @IsNumber()
  @IsOptional()
  endHour?: number;
}

class PortfolioProjectDto {
  @IsString()
  @IsOptional()
  id?: string;

  @IsString()
  title: string;

  @IsString()
  description: string;

  @IsString()
  @IsOptional()
  location?: string;

  @IsArray()
  @IsString({ each: true })
  images: string[];

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  videos?: string[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BeforeAfterPairDto)
  @IsOptional()
  beforeAfterPairs?: BeforeAfterPairDto[];
}

export class UpdateProfileDto {
  // ============== BASIC USER FIELDS ==============
  @ApiPropertyOptional({ description: "User display name" })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ description: "Phone number" })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional({ description: "WhatsApp number" })
  @IsOptional()
  @IsString()
  whatsapp?: string;

  @ApiPropertyOptional({ description: "Telegram username (without @)" })
  @IsOptional()
  @IsString()
  telegram?: string;

  @ApiPropertyOptional({ description: "City" })
  @IsOptional()
  @IsString()
  city?: string;

  @ApiPropertyOptional({ description: "Avatar URL or base64 image" })
  @IsOptional()
  @IsString()
  avatar?: string;

  // ============== PRO-SPECIFIC FIELDS ==============
  @ApiPropertyOptional({ description: "Professional title" })
  @IsString()
  @IsOptional()
  title?: string;

  @ApiPropertyOptional({ description: "Professional description/bio" })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({ description: "Categories the pro works in" })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  categories?: string[];

  @ApiPropertyOptional({
    description: "Selected subcategories/specializations",
    example: ["interior", "exterior", "3d-visualization"],
  })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  subcategories?: string[];

  @ApiPropertyOptional({
    description: "Selected services with experience level per service",
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SelectedServiceDto)
  @IsOptional()
  selectedServices?: SelectedServiceDto[];

  @ApiPropertyOptional({ description: "Years of experience" })
  @IsNumber()
  @Min(0)
  @IsOptional()
  yearsExperience?: number;

  @ApiPropertyOptional({ description: "Service areas/cities" })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  serviceAreas?: string[];

  @ApiPropertyOptional({
    description: "Pricing model (fixed | range | byAgreement)",
    enum: Object.values(PricingModel),
  })
  @IsEnum(PricingModel)
  @IsOptional()
  pricingModel?: PricingModel;

  @ApiPropertyOptional({ description: "Base/minimum price" })
  @IsNumber()
  @IsOptional()
  basePrice?: number;

  @ApiPropertyOptional({ description: "Maximum price for price range" })
  @IsNumber()
  @IsOptional()
  maxPrice?: number;

  @ApiPropertyOptional({ description: "Currency code" })
  @IsString()
  @IsOptional()
  currency?: string;

  @ApiPropertyOptional({ description: "Is available for work" })
  @IsBoolean()
  @IsOptional()
  isAvailable?: boolean;

  @ApiPropertyOptional({ description: "Pro status", enum: ProStatus })
  @IsEnum(ProStatus)
  @IsOptional()
  status?: ProStatus;

  @ApiPropertyOptional({ description: "Cover image URL" })
  @IsString()
  @IsOptional()
  coverImage?: string;

  @ApiPropertyOptional({ description: "Certifications" })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  certifications?: string[];

  @ApiPropertyOptional({ description: "Languages spoken" })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  languages?: string[];

  @ApiPropertyOptional({ description: "Short tagline" })
  @IsString()
  @IsOptional()
  tagline?: string;

  @ApiPropertyOptional({ description: "Bio/about text" })
  @IsString()
  @IsOptional()
  bio?: string;

  @ApiPropertyOptional({ description: "Profile type (personal or company)" })
  @IsString()
  @IsOptional()
  profileType?: string;

  @ApiPropertyOptional({ description: "Portfolio projects" })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PortfolioProjectDto)
  @IsOptional()
  portfolioProjects?: PortfolioProjectDto[];

  // Interior Designer specific fields
  @ApiPropertyOptional({
    description: "Pinterest board/pin URLs for portfolio (Interior Designers)",
    example: [
      "https://pinterest.com/user/board1",
      "https://pinterest.com/pin/123",
    ],
  })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  pinterestLinks?: string[];

  @ApiPropertyOptional({
    description: "Portfolio image URLs (Interior Designers)",
  })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  portfolioImages?: string[];

  @ApiPropertyOptional({
    description: "Design style (Interior Designers)",
    example: "Modern",
  })
  @IsString()
  @IsOptional()
  designStyle?: string;

  @ApiPropertyOptional({
    description: "Design styles array (Interior Designers)",
    example: ["modern", "minimalist", "scandinavian"],
  })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  designStyles?: string[];

  // Architect specific fields
  @ApiPropertyOptional({
    description: "Cadastral ID from Public Service Hall (Architects)",
    example: "01.18.01.004.001",
  })
  @IsString()
  @IsOptional()
  cadastralId?: string;

  @ApiPropertyOptional({ description: "Professional architect license number" })
  @IsString()
  @IsOptional()
  architectLicenseNumber?: string;

  @ApiPropertyOptional({
    description: "References to completed building projects (Architects)",
  })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  completedProjects?: string[];

  @ApiPropertyOptional({
    description: "Availability options (e.g., weekdays, weekends, evenings)",
  })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  availability?: string[];

  @ApiPropertyOptional({ description: "Weekly schedule for time-slot booking" })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => WeeklyScheduleEntryDto)
  @IsOptional()
  weeklySchedule?: WeeklyScheduleEntryDto[];

  @ApiPropertyOptional({
    description: "Date-specific schedule overrides (blocked days)",
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ScheduleOverrideDto)
  @IsOptional()
  scheduleOverrides?: ScheduleOverrideDto[];

  @ApiPropertyOptional({ description: "External completed jobs count" })
  @IsNumber()
  @IsOptional()
  externalCompletedJobs?: number;

  // Social links for verification
  @ApiPropertyOptional({ description: "Facebook profile/page URL" })
  @IsString()
  @IsOptional()
  facebookUrl?: string;

  @ApiPropertyOptional({ description: "Instagram profile URL" })
  @IsString()
  @IsOptional()
  instagramUrl?: string;

  @ApiPropertyOptional({ description: "LinkedIn profile URL" })
  @IsString()
  @IsOptional()
  linkedinUrl?: string;

  @ApiPropertyOptional({ description: "Personal/business website URL" })
  @IsString()
  @IsOptional()
  websiteUrl?: string;

  // ID Verification documents
  @ApiPropertyOptional({ description: "ID document front image URL" })
  @IsString()
  @IsOptional()
  idDocumentUrl?: string;

  @ApiPropertyOptional({ description: "ID document back image URL (optional)" })
  @IsString()
  @IsOptional()
  idDocumentBackUrl?: string;

  @ApiPropertyOptional({ description: "Selfie holding ID image URL" })
  @IsString()
  @IsOptional()
  selfieWithIdUrl?: string;
}
