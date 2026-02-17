import { IsEmail, IsEnum, IsNotEmpty, IsOptional, IsString, MinLength, ValidateIf } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { UserRole, AccountType } from '../schemas/user.schema';

export class CreateUserDto {
  @ApiProperty({ example: 'John Doe', description: 'User full name' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiPropertyOptional({ example: 'john@example.com', description: 'User email address (optional, for newsletters)' })
  @ValidateIf((o) => o.email && o.email.length > 0)
  @IsEmail()
  @IsOptional()
  email?: string;

  @ApiProperty({ example: 'password123', description: 'User password (min 6 characters)', minLength: 6 })
  @IsString()
  @MinLength(6)
  password: string;

  @ApiPropertyOptional({ enum: UserRole, example: UserRole.CLIENT, description: 'User role' })
  @IsEnum(UserRole)
  @IsOptional()
  role?: UserRole;

  @ApiPropertyOptional({ example: '+1234567890', description: 'Phone number' })
  @IsString()
  @IsOptional()
  phone?: string;

  @ApiPropertyOptional({ example: '+1234567890', description: 'WhatsApp number' })
  @IsString()
  @IsOptional()
  whatsapp?: string;

  @ApiPropertyOptional({ example: 'username', description: 'Telegram username (without @)' })
  @IsString()
  @IsOptional()
  telegram?: string;

  @ApiPropertyOptional({ example: 'New York', description: 'City' })
  @IsString()
  @IsOptional()
  city?: string;

  @ApiPropertyOptional({ description: 'User avatar (base64 or URL)' })
  @IsString()
  @IsOptional()
  avatar?: string;

  @ApiPropertyOptional({
    description: 'Selected categories for professionals (what services they offer)',
    example: ['interior-design', 'architecture'],
    type: [String]
  })
  @IsOptional()
  selectedCategories?: string[];

  @ApiPropertyOptional({
    description: 'Selected subcategories/specializations for professionals',
    example: ['interior', 'exterior', '3d-visualization'],
    type: [String]
  })
  @IsOptional()
  selectedSubcategories?: string[];

  @ApiPropertyOptional({
    description: 'Custom services added by user during registration (free-form text)',
    example: ['Kitchen Design', 'Bathroom Renovation'],
    type: [String]
  })
  @IsOptional()
  customServices?: string[];

  @ApiPropertyOptional({
    description: 'Portfolio projects added during registration',
    type: 'array',
    items: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        description: { type: 'string' },
        images: { type: 'array', items: { type: 'string' } },
      }
    }
  })
  @IsOptional()
  portfolioProjects?: Array<{
    title: string;
    description?: string;
    images: string[];
  }>;

  @ApiPropertyOptional({
    enum: AccountType,
    example: AccountType.INDIVIDUAL,
    description: 'Account type - individual or organization'
  })
  @IsEnum(AccountType)
  @IsOptional()
  accountType?: AccountType;

  @ApiPropertyOptional({
    example: true,
    description: 'Whether phone has been verified via OTP during registration'
  })
  @IsOptional()
  isPhoneVerified?: boolean;
}
