import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsEmail,
  IsOptional,
  IsArray,
  IsEnum,
  IsBoolean,
} from 'class-validator';
import { EmployeeRole } from '../schemas/company-employee.schema';

export class InviteEmployeeDto {
  @ApiProperty({ example: 'Giorgi Beridze' })
  @IsString()
  name: string;

  @ApiProperty({ example: 'giorgi@email.com' })
  @IsEmail()
  email: string;

  @ApiPropertyOptional({ example: '+995 555 123 456' })
  @IsString()
  @IsOptional()
  phone?: string;

  @ApiPropertyOptional({ enum: EmployeeRole, example: EmployeeRole.WORKER })
  @IsEnum(EmployeeRole)
  @IsOptional()
  role?: EmployeeRole;

  @ApiPropertyOptional({ example: 'Senior Electrician' })
  @IsString()
  @IsOptional()
  jobTitle?: string;

  @ApiPropertyOptional({ example: ['Electrical', 'Smart Home'] })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  skills?: string[];

  @ApiPropertyOptional({ example: 'Electrical' })
  @IsString()
  @IsOptional()
  department?: string;
}

export class UpdateEmployeeDto {
  @ApiPropertyOptional({ example: 'Giorgi Beridze' })
  @IsString()
  @IsOptional()
  name?: string;

  @ApiPropertyOptional({ example: '+995 555 123 456' })
  @IsString()
  @IsOptional()
  phone?: string;

  @ApiPropertyOptional({ enum: EmployeeRole })
  @IsEnum(EmployeeRole)
  @IsOptional()
  role?: EmployeeRole;

  @ApiPropertyOptional({ example: 'Lead Electrician' })
  @IsString()
  @IsOptional()
  jobTitle?: string;

  @ApiPropertyOptional({ example: ['Electrical', 'Smart Home', 'Solar'] })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  skills?: string[];

  @ApiPropertyOptional({ example: 'Electrical' })
  @IsString()
  @IsOptional()
  department?: string;

  @ApiPropertyOptional()
  @IsBoolean()
  @IsOptional()
  isAvailable?: boolean;

  @ApiPropertyOptional({ example: 'On vacation until Dec 15' })
  @IsString()
  @IsOptional()
  availabilityNote?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  notes?: string;
}

export class UpdateEmployeePermissionsDto {
  @ApiPropertyOptional()
  @IsBoolean()
  @IsOptional()
  canViewJobs?: boolean;

  @ApiPropertyOptional()
  @IsBoolean()
  @IsOptional()
  canAcceptJobs?: boolean;

  @ApiPropertyOptional()
  @IsBoolean()
  @IsOptional()
  canManageWorkers?: boolean;

  @ApiPropertyOptional()
  @IsBoolean()
  @IsOptional()
  canManageCompany?: boolean;

  @ApiPropertyOptional()
  @IsBoolean()
  @IsOptional()
  canViewFinances?: boolean;

  @ApiPropertyOptional()
  @IsBoolean()
  @IsOptional()
  canMessageClients?: boolean;
}
