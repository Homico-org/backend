import { ArrayMaxSize, ArrayMinSize, IsArray, IsOptional, IsString } from 'class-validator';

export class CompleteWorkDto {
  // Cap photos at 20 per booking - matches what fits comfortably in the
  // workspace portfolio rendering and stops a buggy client from
  // ballooning the booking document. The frontend uploader already
  // enforces a similar limit; this is the server-side guard.
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  @IsString({ each: true })
  afterPhotos: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(5)
  @IsString({ each: true })
  videos?: string[];
}
