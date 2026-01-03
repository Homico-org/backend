import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { JobsController } from './jobs.controller';
import { JobsService } from './jobs.service';
import { JobsTasksService } from './jobs-tasks.service';
import { ProjectTrackingService } from './project-tracking.service';
import { WorkspaceService } from './workspace.service';
import { PollsService } from './polls.service';
import { Job, JobSchema, JobView, JobViewSchema } from './schemas/job.schema';
import { Proposal, ProposalSchema } from './schemas/proposal.schema';
import { SavedJob, SavedJobSchema } from './schemas/saved-job.schema';
import { ProjectTracking, ProjectTrackingSchema } from './schemas/project-tracking.schema';
import { ProjectWorkspace, ProjectWorkspaceSchema } from './schemas/workspace.schema';
import { Poll, PollSchema } from './schemas/poll.schema';
import { User, UserSchema } from '../users/schemas/user.schema';
import { NotificationsModule } from '../notifications/notifications.module';
import { ChatModule } from '../chat/chat.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Job.name, schema: JobSchema },
      { name: JobView.name, schema: JobViewSchema },
      { name: Proposal.name, schema: ProposalSchema },
      { name: SavedJob.name, schema: SavedJobSchema },
      { name: ProjectTracking.name, schema: ProjectTrackingSchema },
      { name: ProjectWorkspace.name, schema: ProjectWorkspaceSchema },
      { name: Poll.name, schema: PollSchema },
      { name: User.name, schema: UserSchema },
    ]),
    NotificationsModule,
    forwardRef(() => ChatModule),
  ],
  controllers: [JobsController],
  providers: [JobsService, JobsTasksService, ProjectTrackingService, WorkspaceService, PollsService],
  exports: [JobsService, ProjectTrackingService, WorkspaceService, PollsService],
})
export class JobsModule {}
