import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Cron, CronExpression } from "@nestjs/schedule";
import { Model, Types } from "mongoose";

import { Job, JobStatus } from "../jobs/schemas/job.schema";
import {
  BookingFrequency,
  BookingSeries,
  BookingSeriesDocument,
  BookingSeriesStatus,
  FREQUENCY_INTERVAL_DAYS,
} from "./schemas/booking-series.schema";
import { CreateBookingSeriesDto } from "./dto/create-booking-series.dto";

/** How far ahead visits are materialised. The cron keeps this window full. */
const GENERATION_WINDOW_DAYS = 84; // ~12 weeks

function toISODate(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

function parseISODate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

@Injectable()
export class BookingSeriesService {
  private readonly logger = new Logger(BookingSeriesService.name);

  constructor(
    @InjectModel(BookingSeries.name)
    private seriesModel: Model<BookingSeriesDocument>,
    @InjectModel(Job.name) private jobModel: Model<Job>,
  ) {}

  /**
   * Every date a series should run on, from `from` (inclusive) up to
   * `throughDate`. Monthly steps by calendar month and clamps to the last day
   * of shorter months, so a 31st booking still lands in February.
   */
  private occurrenceDates(
    startDate: string,
    frequency: BookingFrequency,
    from: string,
    throughDate: Date,
  ): string[] {
    const dates: string[] = [];
    const start = parseISODate(startDate);
    const fromDate = parseISODate(from);
    const intervalDays = FREQUENCY_INTERVAL_DAYS[frequency];

    if (frequency === BookingFrequency.MONTHLY) {
      const dayOfMonth = start.getDate();
      const cursor = new Date(start);
      let month = 0;
      while (cursor.getTime() <= throughDate.getTime()) {
        if (cursor.getTime() >= fromDate.getTime()) dates.push(toISODate(cursor));
        month += 1;
        const next = new Date(start.getFullYear(), start.getMonth() + month, 1);
        const lastDay = new Date(
          next.getFullYear(),
          next.getMonth() + 1,
          0,
        ).getDate();
        next.setDate(Math.min(dayOfMonth, lastDay));
        cursor.setTime(next.getTime());
      }
      return dates;
    }

    if (!intervalDays) return dates;

    const cursor = new Date(start);
    while (cursor.getTime() <= throughDate.getTime()) {
      if (cursor.getTime() >= fromDate.getTime()) dates.push(toISODate(cursor));
      cursor.setDate(cursor.getDate() + intervalDays);
    }
    return dates;
  }

  /**
   * Create the Job documents for every date in the window that doesn't have one
   * yet. Safe to call repeatedly - existing visits are skipped by date.
   */
  private async generateVisits(
    series: BookingSeriesDocument,
    from?: string,
  ): Promise<number> {
    const through = new Date();
    through.setDate(through.getDate() + GENERATION_WINDOW_DAYS);

    const startFrom = from ?? series.startDate;
    const dates = this.occurrenceDates(
      series.startDate,
      series.frequency,
      startFrom,
      through,
    );
    if (!dates.length) return 0;

    const existing = await this.jobModel
      .find({ seriesId: series._id, scheduledDate: { $in: dates } })
      .select("scheduledDate")
      .lean();
    const taken = new Set(existing.map((j) => j.scheduledDate));

    const missing = dates.filter((d) => !taken.has(d));
    if (!missing.length) return 0;

    // occurrenceIndex continues from whatever already exists so the numbering
    // stays stable across top-ups.
    const count = await this.jobModel.countDocuments({ seriesId: series._id });

    // `jobNumber` carries a unique index, so every visit needs its own value -
    // leaving it unset makes the second insert collide on null.
    const lastJob = await this.jobModel
      .findOne({}, { jobNumber: 1 })
      .sort({ jobNumber: -1 })
      .lean();
    const baseJobNumber = (lastJob?.jobNumber || 1000) + 1;

    await this.jobModel.insertMany(
      missing.map((date, i) => ({
        jobNumber: baseJobNumber + i,
        clientId: series.clientId,
        title: `Cleaning - ${series.cleaningType}`,
        description: series.notes || "",
        category: "cleaning",
        subcategory: series.cleaningType,
        jobType: "marketplace",
        location: series.location,
        address: series.address,
        budgetType: "fixed",
        budgetAmount: series.visitPrice,
        scheduledDate: date,
        scheduledSlot: series.scheduledSlot,
        status: JobStatus.OPEN,
        seriesId: series._id,
        occurrenceIndex: count + i,
        hiredProId: series.preferredProId,
      })),
    );

    series.generatedThrough = dates[dates.length - 1];
    await series.save();

    return missing.length;
  }

  async create(
    clientId: string,
    dto: CreateBookingSeriesDto,
  ): Promise<{ series: BookingSeries; visitsCreated: number }> {
    if (dto.frequency === BookingFrequency.ONE_TIME) {
      throw new BadRequestException(
        "One-time bookings are created via POST /jobs, not as a series",
      );
    }

    const series = await this.seriesModel.create({
      ...dto,
      clientId: new Types.ObjectId(clientId),
      status: BookingSeriesStatus.ACTIVE,
      preferredProId: dto.preferredProId
        ? new Types.ObjectId(dto.preferredProId)
        : undefined,
    });

    // If visit generation fails the series must not survive as an empty shell -
    // the client would see a recurring booking with nothing scheduled.
    let visitsCreated: number;
    try {
      visitsCreated = await this.generateVisits(series);
    } catch (err) {
      await this.seriesModel.deleteOne({ _id: series._id });
      await this.jobModel.deleteMany({ seriesId: series._id });
      this.logger.error(
        `Rolled back series ${series._id}: ${(err as Error).message}`,
      );
      throw err;
    }

    this.logger.log(
      `Created ${dto.frequency} series ${series._id} with ${visitsCreated} visits`,
    );

    return { series, visitsCreated };
  }

  async findMine(clientId: string): Promise<
    Array<BookingSeries & { upcomingCount: number; nextVisitDate?: string }>
  > {
    const series = await this.seriesModel
      .find({ clientId: new Types.ObjectId(clientId) })
      .sort({ createdAt: -1 })
      .lean();

    const today = toISODate(new Date());

    return Promise.all(
      series.map(async (s) => {
        const upcoming = await this.jobModel
          .find({
            seriesId: s._id,
            scheduledDate: { $gte: today },
            status: { $in: [JobStatus.OPEN, JobStatus.IN_PROGRESS] },
          })
          .sort({ scheduledDate: 1 })
          .select("scheduledDate")
          .lean();

        return {
          ...s,
          upcomingCount: upcoming.length,
          nextVisitDate: upcoming[0]?.scheduledDate,
        };
      }),
    );
  }

  private async loadOwned(
    seriesId: string,
    clientId: string,
  ): Promise<BookingSeriesDocument> {
    const series = await this.seriesModel.findById(seriesId);
    if (!series) throw new NotFoundException("Booking series not found");
    if (series.clientId.toString() !== clientId) {
      throw new ForbiddenException("This booking series is not yours");
    }
    return series;
  }

  /**
   * Stop a series. Future visits are removed outright; visits that already
   * started or completed are left alone. The visit happening now (if any) is
   * NOT auto-cancelled - the client cancels that one through the job endpoint
   * so the fee policy applies to it.
   */
  async cancelSeries(
    seriesId: string,
    clientId: string,
    reason?: string,
  ): Promise<{ series: BookingSeries; visitsRemoved: number }> {
    const series = await this.loadOwned(seriesId, clientId);

    if (series.status === BookingSeriesStatus.CANCELLED) {
      throw new BadRequestException("This series is already cancelled");
    }

    const today = toISODate(new Date());
    const result = await this.jobModel.deleteMany({
      seriesId: series._id,
      status: JobStatus.OPEN,
      scheduledDate: { $gt: today },
    });

    series.status = BookingSeriesStatus.CANCELLED;
    series.cancelledAt = new Date();
    if (reason) series.cancellationReason = reason;
    await series.save();

    return { series, visitsRemoved: result.deletedCount ?? 0 };
  }

  async setPaused(
    seriesId: string,
    clientId: string,
    paused: boolean,
  ): Promise<BookingSeries> {
    const series = await this.loadOwned(seriesId, clientId);
    if (series.status === BookingSeriesStatus.CANCELLED) {
      throw new BadRequestException("This series is cancelled");
    }

    if (paused) {
      const today = toISODate(new Date());
      await this.jobModel.deleteMany({
        seriesId: series._id,
        status: JobStatus.OPEN,
        scheduledDate: { $gt: today },
      });
      series.status = BookingSeriesStatus.PAUSED;
    } else {
      series.status = BookingSeriesStatus.ACTIVE;
      await series.save();
      await this.generateVisits(series, toISODate(new Date()));
      return series;
    }

    await series.save();
    return series;
  }

  /** Keeps the rolling window full for every active series. */
  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async topUpVisits(): Promise<void> {
    const active = await this.seriesModel.find({
      status: BookingSeriesStatus.ACTIVE,
    });

    let total = 0;
    for (const series of active) {
      try {
        total += await this.generateVisits(series, toISODate(new Date()));
      } catch (err) {
        this.logger.error(
          `Failed to top up series ${series._id}: ${(err as Error).message}`,
        );
      }
    }

    if (total > 0) {
      this.logger.log(
        `Topped up ${total} visits across ${active.length} active series`,
      );
    }
  }
}
