import { IsEmail, IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { UserRole } from '../../users/schemas/user.schema';

export class GoogleRegisterDto {
  @ApiProperty({ example: '123456789', description: 'Google user ID' })
  @IsString()
  @IsNotEmpty()
  googleId: string;

  @ApiProperty({ example: 'john@gmail.com', description: 'Email from Google account' })
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @ApiProperty({ example: 'John Doe', description: 'Name from Google account' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiPropertyOptional({ example: 'https://...', description: 'Profile picture URL from Google' })
  @IsString()
  @IsOptional()
  picture?: string;

  @ApiPropertyOptional({ example: '+995555123456', description: 'Phone number (verified via OTP) - required only for new registrations' })
  @IsString()
  @IsOptional()
  phone?: string;

  @ApiPropertyOptional({ example: 'password123', description: 'Password for the account (allows login without Google)' })
  @IsString()
  @IsOptional()
  password?: string;

  @ApiPropertyOptional({ enum: UserRole, example: UserRole.CLIENT, description: 'User role' })
  @IsEnum(UserRole)
  @IsOptional()
  role?: UserRole;

  @ApiPropertyOptional({ example: 'Tbilisi', description: 'City' })
  @IsString()
  @IsOptional()
  city?: string;

  @ApiPropertyOptional({ description: 'Selected categories for professionals', type: [String] })
  @IsOptional()
  selectedCategories?: string[];

  @ApiPropertyOptional({ description: 'Selected subcategories for professionals', type: [String] })
  @IsOptional()
  selectedSubcategories?: string[];

  @ApiPropertyOptional({
    description: 'Custom services added by user during registration',
    type: [String]
  })
  @IsOptional()
  customServices?: string[];

  @ApiPropertyOptional({
    description: 'Portfolio projects added during registration',
    type: 'array',
  })
  @IsOptional()
  portfolioProjects?: Array<{
    title: string;
    description?: string;
    images: string[];
  }>;

  @ApiPropertyOptional({ example: true, description: 'Whether phone has been verified via OTP' })
  @IsOptional()
  isPhoneVerified?: boolean;
}
