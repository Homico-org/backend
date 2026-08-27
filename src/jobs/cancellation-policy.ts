/**
 * Cancellation fee policy for cleaning bookings.
 *
 * The customer may always cancel. How much (if anything) they are charged is
 * decided by how much notice the cleaner got, and the cleaner can always waive
 * the result. Percentages apply to the visit price.
 */

export enum CancellationFeeStatus {
  /** No fee applies - nothing for the cleaner to decide. */
  NONE = "none",
  /** Fee proposed by policy, waiting on the cleaner's decision. */
  PENDING = "pending",
  /** Cleaner waived the fee. */
  WAIVED = "waived",
  /** Cleaner confirmed the fee; payment intent raised, not settled yet. */
  CHARGED = "charged",
  /** The client actually paid it. */
  PAID = "paid",
  /** Fee confirmed but the payment failed or was abandoned. */
  FAILED = "failed",
}

export interface CancellationTier {
  /** Applies when notice is strictly less than this many hours. */
  withinHours: number;
  /** Share of the visit price charged, 0-1. */
  rate: number;
  key: string;
}

/**
 * Ordered tightest-window-first. The first matching tier wins; anything with
 * more notice than the last tier is free.
 */
export const CANCELLATION_TIERS: CancellationTier[] = [
  { key: "started", withinHours: 0, rate: 0.5 },
  { key: "lastMinute", withinHours: 2, rate: 0.5 },
  { key: "sameDay", withinHours: 24, rate: 0.3 },
];

/** More notice than this is always free. */
export const FREE_CANCELLATION_HOURS = 24;

export interface CancellationAssessment {
  hoursNotice: number;
  /** Fee in major units (GEL), rounded to whole tetri-free amounts. */
  feeAmount: number;
  rate: number;
  /** Which tier fired, or "free". */
  tier: string;
}

/**
 * Work out what the customer owes for cancelling now.
 *
 * `scheduledStart` is the start of the booked slot. A cancellation after the
 * slot has already begun is treated as the harshest tier rather than as
 * negative notice.
 */
export function assessCancellation(
  visitPrice: number,
  scheduledStart: Date | null,
  now: Date = new Date(),
): CancellationAssessment {
  if (!scheduledStart || Number.isNaN(scheduledStart.getTime())) {
    // No schedule on the job (an unscheduled marketplace request) - nothing to
    // be late for, so nothing to charge.
    return { hoursNotice: Number.POSITIVE_INFINITY, feeAmount: 0, rate: 0, tier: "free" };
  }

  const hoursNotice = (scheduledStart.getTime() - now.getTime()) / 3_600_000;

  if (hoursNotice >= FREE_CANCELLATION_HOURS) {
    return { hoursNotice, feeAmount: 0, rate: 0, tier: "free" };
  }

  const tier =
    CANCELLATION_TIERS.find((t) =>
      t.withinHours === 0 ? hoursNotice <= 0 : hoursNotice < t.withinHours,
    ) ?? CANCELLATION_TIERS[CANCELLATION_TIERS.length - 1];

  const feeAmount = Math.round(Math.max(0, visitPrice) * tier.rate);

  return { hoursNotice, feeAmount, rate: tier.rate, tier: tier.key };
}

/** Parse a job's "2026-03-15" + "09:00-12:00" pair into a Date. */
export function parseScheduledStart(
  scheduledDate?: string,
  scheduledSlot?: string,
): Date | null {
  if (!scheduledDate) return null;
  const startHour = scheduledSlot?.split("-")[0]?.trim() || "00:00";
  const parsed = new Date(`${scheduledDate}T${startHour}:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}
