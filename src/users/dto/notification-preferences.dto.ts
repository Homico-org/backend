import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsBoolean, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

class EmailPreferencesDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  newJobs?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  proposals?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  messages?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  marketing?: boolean;
}

class PushPreferencesDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  newJobs?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  proposals?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  messages?: boolean;
}

class SmsPreferencesDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  proposals?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  messages?: boolean;
}

export class UpdateNotificationPreferencesDto {
  @ApiPropertyOptional({ type: EmailPreferencesDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => EmailPreferencesDto)
  email?: EmailPreferencesDto;

  @ApiPropertyOptional({ type: PushPreferencesDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => PushPreferencesDto)
  push?: PushPreferencesDto;

  @ApiPropertyOptional({ type: SmsPreferencesDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => SmsPreferencesDto)
  sms?: SmsPreferencesDto;
}

export class AddEmailDto {
  @ApiProperty({ example: 'user@example.com' })
  @IsEmail()
  email: string;
}
