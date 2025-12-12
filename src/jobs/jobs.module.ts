import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { JobsController } from './jobs.controller';
import { JobsService } from './jobs.service';
import { Job, JobSchema } from './schemas/job.schema';
import { Proposal, ProposalSchema } from './schemas/proposal.schema';
import { Conversation, ConversationSchema } from '../conversation/schemas/conversation.schema';
import { Message, MessageSchema } from '../message/schemas/message.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Job.name, schema: JobSchema },
      { name: Proposal.name, schema: ProposalSchema },
      { name: Conversation.name, schema: ConversationSchema },
      { name: Message.name, schema: MessageSchema },
    ]),
  ],
  controllers: [JobsController],
  providers: [JobsService],
  exports: [JobsService],
})
export class JobsModule {}
