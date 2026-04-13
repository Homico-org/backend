import { IsArray, IsOptional, IsString } from 'class-validator';

export class StartWorkDto {
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  beforePhotos?: string[];
}
