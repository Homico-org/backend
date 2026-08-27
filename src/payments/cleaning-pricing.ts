// Server-authoritative cleaning pricing. Mirrors the mobile config at
// mobile/src/constants/cleaning.ts - the server is the source of truth for the
// charged amount so a tampered client can't pay less. Keep the two in sync.

export const HOURLY_RATE = 25; // GEL per cleaner-hour

export const MIN_HOURS = 2;
export const MAX_HOURS = 8;

const EXTRA_PRICES: Record<string, number> = {
  windows: 15,
  oven: 15,
  fridge: 10,
  ironing: 10,
  cabinets: 10,
  laundry: 10,
};

const FREQUENCY_DISCOUNTS: Record<string, number> = {
  oneTime: 0,
  weekly: 0.15,
  biweekly: 0.1,
  monthly: 0.05,
};

export function extrasTotal(extraKeys: string[] = []): number {
  return extraKeys.reduce((sum, k) => sum + (EXTRA_PRICES[k] ?? 0), 0);
}

export function frequencyDiscount(frequency?: string): number {
  return FREQUENCY_DISCOUNTS[frequency ?? "oneTime"] ?? 0;
}

// Total = (hours * rate + extras) less the recurring discount, rounded to GEL.
export function computeBookingPrice(
  hours: number,
  extraKeys: string[] = [],
  frequency?: string,
): number {
  const subtotal = hours * HOURLY_RATE + extrasTotal(extraKeys);
  return Math.round(subtotal * (1 - frequencyDiscount(frequency)));
}
