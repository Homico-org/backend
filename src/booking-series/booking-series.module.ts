import { Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";

import { Job, JobSchema } from "../jobs/schemas/job.schema";
import { BookingSeriesController } from "./booking-series.controller";
import { BookingSeriesService } from "./booking-series.service";
import {
  BookingSeries,
  BookingSeriesSchema,
} from "./schemas/booking-series.schema";

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: BookingSeries.name, schema: BookingSeriesSchema },
      { name: Job.name, schema: JobSchema },
    ]),
  ],
  controllers: [BookingSeriesController],
  providers: [BookingSeriesService],
  exports: [BookingSeriesService],
})
export class BookingSeriesModule {}
