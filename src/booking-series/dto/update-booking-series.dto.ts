import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsBoolean, IsOptional, IsString, MaxLength } from "class-validator";

export class PauseBookingSeriesDto {
  @ApiProperty({ description: "true pauses the series, false resumes it" })
  @IsBoolean()
  paused: boolean;
}

export class CancelBookingSeriesDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
