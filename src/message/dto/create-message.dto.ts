import { IsString, IsMongoId, IsArray, IsOptional } from 'class-validator';

export class CreateMessageDto {
  @IsMongoId()
  conversationId: string;

  @IsString()
  content: string;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  attachments?: string[];
}
