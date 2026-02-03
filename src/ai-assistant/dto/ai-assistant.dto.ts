import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsOptional, IsEnum, MaxLength, IsObject } from 'class-validator';

export class CreateSessionDto {
  @ApiPropertyOptional({ description: 'Anonymous visitor ID for non-logged-in users' })
  @IsOptional()
  @IsString()
  anonymousId?: string;

  @ApiPropertyOptional({ description: 'Initial context for the conversation' })
  @IsOptional()
  @IsObject()
  context?: {
    page?: string;
    userRole?: 'client' | 'pro' | 'guest';
    preferredLocale?: 'en' | 'ka' | 'ru';
  };
}

export class SendMessageDto {
  @ApiProperty({ description: 'User message content' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  message: string;

  @ApiPropertyOptional({ description: 'Response locale', enum: ['en', 'ka', 'ru'] })
  @IsOptional()
  @IsEnum(['en', 'ka', 'ru'])
  locale?: 'en' | 'ka' | 'ru';

  @ApiPropertyOptional({ description: 'Current page context' })
  @IsOptional()
  @IsString()
  currentPage?: string;
}

export class ChatMessageResponseDto {
  role: 'user' | 'assistant';
  content: string;
  createdAt: Date;
  suggestedActions?: Array<{
    type: 'link' | 'action';
    label: string;
    labelKa?: string;
    url?: string;
    action?: string;
  }>;
}

export class SessionResponseDto {
  _id: string;
  status: string;
  messageCount: number;
  messages: ChatMessageResponseDto[];
  createdAt: Date;
}
