import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { User, UserSchema } from './schemas/user.schema';
import { AuthModule } from '../auth/auth.module';
import { Job, JobSchema } from '../jobs/schemas/job.schema';
import { Proposal, ProposalSchema } from '../jobs/schemas/proposal.schema';
import { SavedJob, SavedJobSchema } from '../jobs/schemas/saved-job.schema';
import { Conversation, ConversationSchema } from '../conversation/schemas/conversation.schema';
import { Message, MessageSchema } from '../message/schemas/message.schema';
import { Notification, NotificationSchema } from '../notifications/schemas/notification.schema';
import { Review, ReviewSchema } from '../review/schemas/review.schema';
import { Like, LikeSchema } from '../likes/schemas/like.schema';
import { PortfolioItem, PortfolioItemSchema } from '../portfolio/schemas/portfolio-item.schema';
import { ProjectRequest, ProjectRequestSchema } from '../project-request/schemas/project-request.schema';
import { Offer, OfferSchema } from '../offer/schemas/offer.schema';
import { SupportTicket, SupportTicketSchema } from '../support/schemas/support-ticket.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
      { name: Job.name, schema: JobSchema },
      { name: Proposal.name, schema: ProposalSchema },
      { name: SavedJob.name, schema: SavedJobSchema },
      { name: Conversation.name, schema: ConversationSchema },
      { name: Message.name, schema: MessageSchema },
      { name: Notification.name, schema: NotificationSchema },
      { name: Review.name, schema: ReviewSchema },
      { name: Like.name, schema: LikeSchema },
      { name: PortfolioItem.name, schema: PortfolioItemSchema },
      { name: ProjectRequest.name, schema: ProjectRequestSchema },
      { name: Offer.name, schema: OfferSchema },
      { name: SupportTicket.name, schema: SupportTicketSchema },
    ]),
    forwardRef(() => AuthModule),
  ],
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
