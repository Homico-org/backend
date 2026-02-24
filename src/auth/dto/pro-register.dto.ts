import { IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ProRegisterDto {
  @ApiProperty({ example: '+995555123456', description: 'Phone number' })
  @IsString()
  phone: string;

  @ApiProperty({ example: '1234', description: 'OTP code' })
  @IsString()
  code: string;

  @ApiProperty({ example: 'John', description: 'Full name' })
  @IsString()
  name: string;
}
