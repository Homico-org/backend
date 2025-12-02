import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsArray,
  IsNumber,
  IsEnum,
  IsDateString,
  IsMongoId,
} from 'class-validator';
import { JobPriority } from '../schemas/company-job.schema';

export class CreateCompanyJobDto {
  @ApiProperty({ example: 'Kitchen Renovation - Vake District' })
  @IsString()
  title: string;

  @ApiPropertyOptional({ example: 'Full kitchen renovation including cabinets and plumbing' })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({ example: 'Renovation' })
  @IsString()
  @IsOptional()
  category?: string;

  @ApiPropertyOptional({ example: ['Plumbing', 'Electrical', 'Carpentry'] })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  skills?: string[];

  // Client info
  @ApiProperty()
  @IsMongoId()
  clientId: string;

  @ApiPropertyOptional({ example: 'Nino Beridze' })
  @IsString()
  @IsOptional()
  clientName?: string;

  @ApiPropertyOptional({ example: '+995 555 111 222' })
  @IsString()
  @IsOptional()
  clientPhone?: string;

  @ApiPropertyOptional({ example: 'nino@email.com' })
  @IsString()
  @IsOptional()
  clientEmail?: string;

  // Location
  @ApiPropertyOptional({ example: 'Tbilisi, Vake' })
  @IsString()
  @IsOptional()
  location?: string;

  @ApiPropertyOptional({ example: '15 Chavchavadze Ave, Apt 12' })
  @IsString()
  @IsOptional()
  address?: string;

  // Scheduling
  @ApiPropertyOptional()
  @IsDateString()
  @IsOptional()
  scheduledDate?: string;

  @ApiPropertyOptional({ example: '10:00' })
  @IsString()
  @IsOptional()
  scheduledTime?: string;

  @ApiPropertyOptional({ example: '3 days' })
  @IsString()
  @IsOptional()
  estimatedDuration?: string;

  @ApiPropertyOptional()
  @IsDateString()
  @IsOptional()
  deadline?: string;

  // Priority
  @ApiPropertyOptional({ enum: JobPriority, example: JobPriority.MEDIUM })
  @IsEnum(JobPriority)
  @IsOptional()
  priority?: JobPriority;

  // Pricing
  @ApiPropertyOptional({ example: 5000 })
  @IsNumber()
  @IsOptional()
  quotedPrice?: number;

  @ApiPropertyOptional({ example: 'GEL' })
  @IsString()
  @IsOptional()
  currency?: string;

  // Notes
  @ApiPropertyOptional({ example: 'Client prefers morning appointments' })
  @IsString()
  @IsOptional()
  internalNotes?: string;

  @ApiPropertyOptional({ example: ['urgent', 'vip-client'] })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  tags?: string[];

  // Source references
  @ApiPropertyOptional()
  @IsMongoId()
  @IsOptional()
  originalJobId?: string;

  @ApiPropertyOptional()
  @IsMongoId()
  @IsOptional()
  projectRequestId?: string;
}

export class AssignJobDto {
  @ApiProperty({ example: ['employee_id_1', 'employee_id_2'] })
  @IsArray()
  @IsMongoId({ each: true })
  employeeIds: string[];

  @ApiPropertyOptional()
  @IsMongoId()
  @IsOptional()
  leadEmployeeId?: string;
}

export class UpdateCompanyJobDto {
  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  title?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional()
  @IsDateString()
  @IsOptional()
  scheduledDate?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  scheduledTime?: string;

  @ApiPropertyOptional({ enum: JobPriority })
  @IsEnum(JobPriority)
  @IsOptional()
  priority?: JobPriority;

  @ApiPropertyOptional()
  @IsNumber()
  @IsOptional()
  quotedPrice?: number;

  @ApiPropertyOptional()
  @IsNumber()
  @IsOptional()
  finalPrice?: number;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  internalNotes?: string;

  @ApiPropertyOptional()
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  progressNotes?: string[];

  @ApiPropertyOptional()
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  photos?: string[];
}

export class CompleteJobDto {
  @ApiPropertyOptional()
  @IsNumber()
  @IsOptional()
  finalPrice?: number;

  @ApiPropertyOptional()
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  completionPhotos?: string[];

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  completionNotes?: string;
}
