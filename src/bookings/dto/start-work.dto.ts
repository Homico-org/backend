import { ArrayMaxSize, IsArray, IsOptional, IsString } from 'class-validator';

export class StartWorkDto {
  // Cap matches CompleteWorkDto.afterPhotos so before/after pairings
  // can't get out of sync from the API surface.
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  beforePhotos?: string[];
}
