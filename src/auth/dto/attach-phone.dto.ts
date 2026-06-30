import { IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class AttachPhoneDto {
  @ApiProperty({ example: '+995555123456', description: 'Phone number (E.164, +995…)' })
  @IsString()
  identifier: string;

  @ApiProperty({ example: '1234', description: 'OTP code received by SMS/WhatsApp' })
  @IsString()
  code: string;
}
