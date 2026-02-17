import { Type } from 'class-transformer';
import { IsString, IsOptional, IsArray, ValidateNested, ArrayMaxSize } from 'class-validator';

export class TrackEventItem {
  @IsString()
  event: string;

  @IsString()
  target: string;

  @IsOptional()
  @IsString()
  label?: string;
}

export class TrackEventsDto {
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => TrackEventItem)
  events: TrackEventItem[];
}
