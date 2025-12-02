import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ProjectRequestService } from './project-request.service';
import { ProjectRequestController } from './project-request.controller';
import { ProjectRequest, ProjectRequestSchema } from './schemas/project-request.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: ProjectRequest.name, schema: ProjectRequestSchema },
    ]),
  ],
  controllers: [ProjectRequestController],
  providers: [ProjectRequestService],
  exports: [ProjectRequestService],
})
export class ProjectRequestModule {}
