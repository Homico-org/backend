import { PartialType } from '@nestjs/swagger';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsObject, IsOptional, IsString } from 'class-validator';
import { CreateCompanyDto } from './create-company.dto';

class WorkingHoursDay {
  open: string;
  close: string;
  closed: boolean;
}

class WorkingHours {
  monday: WorkingHoursDay;
  tuesday: WorkingHoursDay;
  wednesday: WorkingHoursDay;
  thursday: WorkingHoursDay;
  friday: WorkingHoursDay;
  saturday: WorkingHoursDay;
  sunday: WorkingHoursDay;
}

class SocialLinks {
  facebook?: string;
  instagram?: string;
  linkedin?: string;
  twitter?: string;
}

export class UpdateCompanyDto extends PartialType(CreateCompanyDto) {
  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  logo?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  coverImage?: string;

  @ApiPropertyOptional()
  @IsBoolean()
  @IsOptional()
  isHiring?: boolean;

  @ApiPropertyOptional()
  @IsBoolean()
  @IsOptional()
  acceptingJobs?: boolean;

  @ApiPropertyOptional()
  @IsObject()
  @IsOptional()
  workingHours?: WorkingHours;

  @ApiPropertyOptional()
  @IsObject()
  @IsOptional()
  socialLinks?: SocialLinks;
}
