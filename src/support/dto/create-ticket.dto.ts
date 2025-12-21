import { IsString, IsOptional, IsEnum } from 'class-validator';

export class CreateTicketDto {
  @IsString()
  subject: string;

  @IsString()
  category: string;

  @IsOptional()
  @IsString()
  subcategory?: string;

  @IsString()
  message: string;

  @IsOptional()
  @IsString()
  relatedItemType?: string;

  @IsOptional()
  @IsString()
  relatedItemId?: string;

  @IsOptional()
  @IsEnum(['low', 'medium', 'high', 'urgent'])
  priority?: string;
}

export class SendMessageDto {
  @IsString()
  content: string;

  @IsOptional()
  attachments?: string[];
}

export class UpdateTicketStatusDto {
  @IsEnum(['open', 'in_progress', 'resolved', 'closed'])
  status: string;
}

export class AssignTicketDto {
  @IsString()
  adminId: string;
}

export class ContactFormDto {
  @IsEnum(['account_issue', 'general', 'feedback'])
  type: string;

  @IsOptional()
  @IsEnum(['email', 'phone'])
  field?: string;

  @IsOptional()
  @IsString()
  value?: string;

  @IsString()
  message: string;

  @IsOptional()
  @IsString()
  contactEmail?: string;

  @IsOptional()
  @IsString()
  contactPhone?: string;
}
