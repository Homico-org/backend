import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
  IsArray,
  IsEnum,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  Min,
  ValidateNested,
} from "class-validator";

import { BookingFrequency } from "../schemas/booking-series.schema";

export class SeriesExtraDto {
  @ApiProperty()
  @IsString()
  key: string;

  @ApiProperty()
  @IsNumber()
  @Min(0)
  price: number;
}

export class CreateBookingSeriesDto {
  @ApiProperty({ enum: BookingFrequency })
  @IsEnum(BookingFrequency)
  frequency: BookingFrequency;

  @ApiProperty({ description: "CLEANING_TYPES key, e.g. home | deep | office" })
  @IsString()
  cleaningType: string;

  @ApiProperty()
  @IsNumber()
  @Min(1)
  hours: number;

  @ApiPropertyOptional({ type: [SeriesExtraDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SeriesExtraDto)
  extras?: SeriesExtraDto[];

  @ApiProperty({ description: "Price of one visit, after the recurring discount" })
  @IsNumber()
  @Min(0)
  visitPrice: number;

  @ApiProperty({ example: "2026-03-15" })
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: "startDate must be YYYY-MM-DD" })
  startDate: string;

  @ApiProperty({ example: "09:00-12:00" })
  @IsString()
  scheduledSlot: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  address?: Record<string, unknown>;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  location?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional({ description: "Preferred cleaner's user id" })
  @IsOptional()
  @IsString()
  preferredProId?: string;
}
