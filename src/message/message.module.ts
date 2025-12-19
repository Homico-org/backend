import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { MessageService } from './message.service';
import { MessageController } from './message.controller';
import { Message, MessageSchema } from './schemas/message.schema';
import { ConversationModule } from '../conversation/conversation.module';
import { ProProfile, ProProfileSchema } from '../pro-profile/schemas/pro-profile.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Message.name, schema: MessageSchema },
      { name: ProProfile.name, schema: ProProfileSchema },
    ]),
    ConversationModule,
  ],
  controllers: [MessageController],
  providers: [MessageService],
  exports: [MessageService],
})
export class MessageModule {}
