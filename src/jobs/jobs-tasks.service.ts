import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { JobsService } from './jobs.service';

@Injectable()
export class JobsTasksService {
  private readonly logger = new Logger(JobsTasksService.name);

  constructor(private readonly jobsService: JobsService) {}

  // Run every day at midnight (00:00)
  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async handleExpireJobs() {
    this.logger.log('Running job expiration task...');

    try {
      const expiredCount = await this.jobsService.expireOldJobs();

      if (expiredCount > 0) {
        this.logger.log(`Expired ${expiredCount} jobs that were older than 30 days`);
      } else {
        this.logger.log('No jobs to expire');
      }
    } catch (error) {
      this.logger.error('Failed to expire old jobs:', error);
    }
  }
}
