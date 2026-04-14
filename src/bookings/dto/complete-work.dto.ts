import { ArrayMinSize, IsArray, IsOptional, IsString } from 'class-validator';

export class CompleteWorkDto {
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  afterPhotos: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  videos?: string[];
}
