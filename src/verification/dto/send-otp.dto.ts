import { IsString, IsEnum, IsEmail, IsOptional } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export enum OtpType {
  EMAIL = 'email',
  PHONE = 'phone',
}

export class SendOtpDto {
  @ApiProperty({
    description: 'Email address or phone number to send OTP to',
    example: 'user@example.com or +995555123456',
  })
  @IsString()
  identifier: string;

  @ApiProperty({
    description: 'Type of verification',
    enum: OtpType,
    example: OtpType.EMAIL,
  })
  @IsEnum(OtpType)
  type: OtpType;
}

export class VerifyOtpDto {
  @ApiProperty({
    description: 'Email address or phone number that received the OTP',
    example: 'user@example.com or +995555123456',
  })
  @IsString()
  identifier: string;

  @ApiProperty({
    description: 'OTP code received',
    example: '123456',
  })
  @IsString()
  code: string;

  @ApiProperty({
    description: 'Type of verification',
    enum: OtpType,
    example: OtpType.EMAIL,
  })
  @IsEnum(OtpType)
  type: OtpType;
}
