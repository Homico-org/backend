import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from '../auth/auth.module';
import { JobsModule } from '../jobs/jobs.module';
import { UsersModule } from '../users/users.module';
import { VerificationModule } from '../verification/verification.module';
import { AssistedJobController } from './assisted-job.controller';
import { AssistedJobService } from './assisted-job.service';
import {
  AssistedJob,
  AssistedJobSchema,
} from './schemas/assisted-job.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: AssistedJob.name, schema: AssistedJobSchema },
    ]),
    JobsModule, // JobsService (createJob)
    UsersModule, // UsersService (findByEmailOrPhone)
    AuthModule, // AuthService (login / register)
    VerificationModule, // SmsService + EmailService (send link)
  ],
  controllers: [AssistedJobController],
  providers: [AssistedJobService],
})
export class AssistedJobModule {}
