import { PartialType } from '@nestjs/mapped-types';
import { IsBoolean, IsOptional } from 'class-validator';
import { CreateProProfileDto } from './create-pro-profile.dto';

export class UpdateProProfileDto extends PartialType(CreateProProfileDto) {
  @IsBoolean()
  @IsOptional()
  isAvailable?: boolean;
}
