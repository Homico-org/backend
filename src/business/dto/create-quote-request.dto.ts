import { IsString, IsEmail, IsEnum, IsOptional } from 'class-validator';

export class CreateQuoteRequestDto {
  @IsString()
  companyName: string;

  @IsString()
  contactName: string;

  @IsEmail()
  email: string;

  @IsString()
  phone: string;

  @IsEnum(['cleaning', 'repair', 'design', 'construction', 'other'])
  serviceType: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsEnum(['on_demand', 'standard', 'business', 'not_sure'])
  preferredPlan?: string;
}

export class UpdateQuoteStatusDto {
  @IsEnum(['new', 'contacted', 'converted', 'closed'])
  status: string;
}
