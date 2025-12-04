import { IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class LoginDto {
  @ApiProperty({ example: 'john@example.com or +995555123456', description: 'User email or phone number' })
  @IsString()
  identifier: string;

  @ApiProperty({ example: 'password123', description: 'User password' })
  @IsString()
  password: string;
}
