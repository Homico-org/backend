import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ConfigModule } from '@nestjs/config';
import { AiAssistantController } from './ai-assistant.controller';
import { AiAssistantService } from './ai-assistant.service';
import { AiToolsService } from './ai-tools.service';
import { ChatSession, ChatSessionSchema } from './schemas/chat-session.schema';
import { ChatMessage, ChatMessageSchema } from './schemas/chat-message.schema';
import { UsersModule } from '../users/users.module';
import { CategoriesModule } from '../categories/categories.module';
import { ReviewModule } from '../review/review.module';

@Module({
  imports: [
    ConfigModule,
    MongooseModule.forFeature([
      { name: ChatSession.name, schema: ChatSessionSchema },
      { name: ChatMessage.name, schema: ChatMessageSchema },
    ]),
    UsersModule,
    CategoriesModule,
    ReviewModule,
  ],
  controllers: [AiAssistantController],
  providers: [AiAssistantService, AiToolsService],
  exports: [AiAssistantService],
})
export class AiAssistantModule {}
