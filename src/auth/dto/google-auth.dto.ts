import { IsString, IsOptional, IsIn } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class GoogleAuthDto {
  @ApiProperty({
    example: 'eyJhbGciOiJSUzI1NiIs...',
    description: 'Google ID token (JWT) returned by Google Sign-In on the client',
  })
  @IsString()
  idToken: string;

  @ApiProperty({
    example: 'client',
    description: "Role to assign when creating a NEW account. Defaults to 'client'.",
    enum: ['client', 'pro'],
    required: false,
  })
  @IsOptional()
  @IsIn(['client', 'pro'])
  role?: 'client' | 'pro';
}
