import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { JobsController } from './jobs.controller';
import { JobsService } from './jobs.service';
import { ProjectTrackingService } from './project-tracking.service';
import { Job, JobSchema } from './schemas/job.schema';
import { Proposal, ProposalSchema } from './schemas/proposal.schema';
import { SavedJob, SavedJobSchema } from './schemas/saved-job.schema';
import { ProjectTracking, ProjectTrackingSchema } from './schemas/project-tracking.schema';
import { User, UserSchema } from '../users/schemas/user.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Job.name, schema: JobSchema },
      { name: Proposal.name, schema: ProposalSchema },
      { name: SavedJob.name, schema: SavedJobSchema },
      { name: ProjectTracking.name, schema: ProjectTrackingSchema },
      { name: User.name, schema: UserSchema },
    ]),
  ],
  controllers: [JobsController],
  providers: [JobsService, ProjectTrackingService],
  exports: [JobsService, ProjectTrackingService],
})
export class JobsModule {}
