import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { AnalyticsEvent } from './schemas/analytics-event.schema';
import { TrackEventItem } from './dto/track-events.dto';

@Injectable()
export class AnalyticsService {
  constructor(
    @InjectModel(AnalyticsEvent.name) private analyticsModel: Model<AnalyticsEvent>,
  ) {}

  async trackEvents(events: TrackEventItem[]): Promise<void> {
    if (!events.length) return;

    const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

    // Group by (event, target) to combine duplicates in the same batch
    const grouped = new Map<string, { event: string; target: string; label: string; count: number }>();
    for (const e of events) {
      const key = `${e.event}::${e.target}`;
      const existing = grouped.get(key);
      if (existing) {
        existing.count += 1;
      } else {
        grouped.set(key, { event: e.event, target: e.target, label: e.label || '', count: 1 });
      }
    }

    const ops = Array.from(grouped.values()).map((g) => ({
      updateOne: {
        filter: { event: g.event, target: g.target, date: today },
        update: {
          $inc: { count: g.count },
          $setOnInsert: { label: g.label },
        },
        upsert: true,
      },
    }));

    await this.analyticsModel.bulkWrite(ops, { ordered: false });
  }

  async getSummary(
    event: string,
    days: number = 7,
    limit: number = 10,
  ): Promise<{ target: string; label: string; count: number }[]> {
    const since = this.getDateSince(days);

    return this.analyticsModel.aggregate([
      { $match: { event, date: { $gte: since } } },
      {
        $group: {
          _id: '$target',
          label: { $last: '$label' },
          count: { $sum: '$count' },
        },
      },
      { $sort: { count: -1 } },
      { $limit: limit },
      {
        $project: {
          _id: 0,
          target: '$_id',
          label: 1,
          count: 1,
        },
      },
    ]);
  }

  async getOverview(
    days: number = 7,
  ): Promise<{ event: string; count: number }[]> {
    const since = this.getDateSince(days);

    return this.analyticsModel.aggregate([
      { $match: { date: { $gte: since } } },
      {
        $group: {
          _id: '$event',
          count: { $sum: '$count' },
        },
      },
      { $sort: { count: -1 } },
      {
        $project: {
          _id: 0,
          event: '$_id',
          count: 1,
        },
      },
    ]);
  }

  private getDateSince(days: number): string {
    const d = new Date();
    d.setDate(d.getDate() - days);
    return d.toISOString().slice(0, 10);
  }
}
