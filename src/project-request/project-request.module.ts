import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ProjectRequestService } from './project-request.service';
import { ProjectRequestController } from './project-request.controller';
import { ProjectRequest, ProjectRequestSchema } from './schemas/project-request.schema';
import {
  ProjectTracking,
  ProjectTrackingSchema,
} from '../jobs/schemas/project-tracking.schema';
import {
  Booking,
  BookingSchema,
} from '../bookings/schemas/booking.schema';
import { Job, JobSchema } from '../jobs/schemas/job.schema';
import { JobsModule } from '../jobs/jobs.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: ProjectRequest.name, schema: ProjectRequestSchema },
      // Read-only here: the dashboard rolls up each engagement's
      // per-worker workspace (progress, stage, history).
      { name: ProjectTracking.name, schema: ProjectTrackingSchema },
      // Read-only: booked engagements derive progress from booking status.
      { name: Booking.name, schema: BookingSchema },
      // Used by "graduate to project" to attach an existing job and to
      // stamp its projectId/engagementId back-ref.
      { name: Job.name, schema: JobSchema },
    ]),
    // Project engagements create scoped jobs (open/invite paths) via
    // JobsService. One-directional: JobsModule only registers the
    // ProjectRequest model (not this module), so no circular import.
    JobsModule,
  ],
  controllers: [ProjectRequestController],
  providers: [ProjectRequestService],
  exports: [ProjectRequestService],
})
export class ProjectRequestModule {}
