import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsEmail,
  IsOptional,
  IsArray,
  IsNumber,
  IsEnum,
  IsUrl,
  Min,
  Max,
} from 'class-validator';
import { CompanySize } from '../schemas/company.schema';

export class CreateCompanyDto {
  @ApiProperty({ example: 'ABC Renovations' })
  @IsString()
  name: string;

  @ApiProperty({ example: 'ABC Renovations LLC' })
  @IsString()
  legalName: string;

  @ApiPropertyOptional({ example: 'Professional renovation services in Tbilisi' })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({ example: 'Quality work, on time, every time' })
  @IsString()
  @IsOptional()
  tagline?: string;

  @ApiProperty({ example: 'contact@abcrenovations.ge' })
  @IsEmail()
  email: string;

  @ApiPropertyOptional({ example: '+995 555 123 456' })
  @IsString()
  @IsOptional()
  phone?: string;

  @ApiPropertyOptional({ example: 'https://abcrenovations.ge' })
  @IsUrl()
  @IsOptional()
  website?: string;

  @ApiPropertyOptional({ example: '123 Rustaveli Ave' })
  @IsString()
  @IsOptional()
  address?: string;

  @ApiPropertyOptional({ example: 'Tbilisi' })
  @IsString()
  @IsOptional()
  city?: string;

  @ApiPropertyOptional({ example: 'Georgia' })
  @IsString()
  @IsOptional()
  country?: string;

  @ApiPropertyOptional({ example: '123456789' })
  @IsString()
  @IsOptional()
  taxId?: string;

  @ApiPropertyOptional({ example: 2015 })
  @IsNumber()
  @IsOptional()
  @Min(1900)
  @Max(new Date().getFullYear())
  foundedYear?: number;

  @ApiPropertyOptional({ enum: CompanySize, example: CompanySize.SMALL })
  @IsEnum(CompanySize)
  @IsOptional()
  size?: CompanySize;

  @ApiPropertyOptional({ example: ['Renovation', 'Plumbing', 'Electrical'] })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  categories?: string[];

  @ApiPropertyOptional({ example: ['Tbilisi', 'Rustavi', 'Mtskheta'] })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  serviceAreas?: string[];

  @ApiPropertyOptional({ example: ['ISO 9001', 'Licensed Contractor'] })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  certifications?: string[];

  @ApiPropertyOptional({ example: ['Georgian', 'English', 'Russian'] })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  languages?: string[];
}
