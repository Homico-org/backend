import { IsString, IsOptional } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class PhoneLoginDto {
  @ApiProperty({ example: '+995555123456', description: 'Phone number' })
  @IsString()
  phone: string;

  @ApiProperty({ example: '1234', description: 'OTP code' })
  @IsString()
  code: string;

  @ApiProperty({ example: 'John', description: 'Name (required for first-time users)', required: false })
  @IsString()
  @IsOptional()
  name?: string;
}
