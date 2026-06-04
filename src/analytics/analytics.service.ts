import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, PipelineStage } from 'mongoose';
import { AnalyticsEvent } from './schemas/analytics-event.schema';
import { TrackEventItem } from './dto/track-events.dto';

@Injectable()
export class AnalyticsService {
  constructor(
    @InjectModel(AnalyticsEvent.name) private analyticsModel: Model<AnalyticsEvent>,
  ) {}

  /**
   * Fire a single analytics event from a backend service. Thin wrapper around
   * `trackEvents` so callsites in jobs.service / bookings.service / payments
   * read cleanly without building one-item arrays. Safe to await or fire-and-
   * forget - failures are swallowed (analytics must never block business
   * logic).
   */
  async trackEvent(event: string, target: string, label = ''): Promise<void> {
    try {
      await this.trackEvents([{ event, target, label }]);
    } catch {
      // Intentionally silent - matches the frontend useTracker behavior.
    }
  }

  /**
   * Bulk upsert pre-computed (event, target, date, count) rows. Unlike
   * `trackEvents` which uses `$inc` (intended for live event firing),
   * this uses `$set` so re-running the same input yields the same final
   * counts. Used by BackfillService to seed historical data from existing
   * Bookings / Proposals / Reviews without double-counting on retry.
   */
  async bulkSetCounts(
    rows: {
      event: string;
      target: string;
      label?: string;
      date: string;
      count: number;
    }[],
  ): Promise<void> {
    if (!rows.length) return;
    const ops = rows.map((r) => ({
      updateOne: {
        filter: { event: r.event, target: r.target, date: r.date },
        update: {
          $set: { count: r.count },
          $setOnInsert: { label: r.label ?? '' },
        },
        upsert: true,
      },
    }));
    await this.analyticsModel.bulkWrite(ops, { ordered: false });
  }

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

  /**
   * Conversion funnel for the admin dashboard. Runs N sums in parallel via
   * $facet so we read the analytics_events collection once per request.
   *
   * `kind=client` traces the client journey: visit pro -> reveal contact ->
   * post a job that gets a proposal -> hire -> pay -> complete -> review.
   *
   * `kind=pro` traces the pro side: signup -> submit a proposal -> get hired
   * -> start work -> complete work.
   *
   * Step order matters for visual rendering (drop-off reads top-to-bottom);
   * the order returned here is the order the dashboard displays.
   */
  async getFunnel(
    days: number,
    kind: 'client' | 'pro',
  ): Promise<{ step: string; count: number }[]> {
    const since = this.getDateSince(days);

    const steps =
      kind === 'client'
        ? [
            'profile_view',
            'contact_reveal',
            'proposal_submit',
            'proposal_accepted',
            'booking_payment_confirmed',
            'booking_completed',
            'review_submit',
          ]
        : [
            'register_pro',
            'proposal_submit',
            'proposal_accepted',
            'booking_started',
            'booking_completed',
          ];

    const facets: Record<string, PipelineStage.FacetPipelineStage[]> = {};
    for (const step of steps) {
      facets[step] = [
        { $match: { event: step, date: { $gte: since } } },
        { $group: { _id: null, total: { $sum: '$count' } } },
      ];
    }

    const [result] = await this.analyticsModel.aggregate([
      { $facet: facets },
    ]);

    return steps.map((step) => ({
      step,
      count: (result?.[step]?.[0]?.total as number) ?? 0,
    }));
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
