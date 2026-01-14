import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength, IsNotEmpty } from 'class-validator';

export class ChangePasswordDto {
  @ApiProperty({ description: 'Current password' })
  @IsString()
  @IsNotEmpty()
  currentPassword: string;

  @ApiProperty({ description: 'New password', minLength: 6 })
  @IsString()
  @MinLength(6)
  @IsNotEmpty()
  newPassword: string;
}
