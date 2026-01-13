import { IsString, IsEnum, IsEmail, IsOptional } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export enum OtpType {
  EMAIL = 'email',
  PHONE = 'phone',
}

export enum OtpChannel {
  SMS = 'sms',
  WHATSAPP = 'whatsapp',
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

  @ApiProperty({
    description: 'Channel for phone verification (sms or whatsapp)',
    enum: OtpChannel,
    example: OtpChannel.SMS,
    required: false,
  })
  @IsOptional()
  @IsEnum(OtpChannel)
  channel?: OtpChannel;
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

export enum OtpPurpose {
  VERIFICATION = 'verification',
  PASSWORD_RESET = 'password_reset',
}

export class ForgotPasswordDto {
  @ApiProperty({
    description: 'Phone number to send password reset OTP',
    example: '+995555123456',
  })
  @IsString()
  phone: string;
}

export class VerifyResetCodeDto {
  @ApiProperty({
    description: 'Phone number that received the OTP',
    example: '+995555123456',
  })
  @IsString()
  phone: string;

  @ApiProperty({
    description: 'OTP code received',
    example: '123456',
  })
  @IsString()
  code: string;
}

export class ResetPasswordDto {
  @ApiProperty({
    description: 'Phone number that received the OTP',
    example: '+995555123456',
  })
  @IsString()
  phone: string;

  @ApiProperty({
    description: 'New password',
    example: 'newSecurePassword123',
  })
  @IsString()
  newPassword: string;
}
