/**
 * Working-hours math for SLA exemptions.
 *
 * The pro accountability cron checks whether a deadline-miss happened
 * inside the pro's set working schedule. A miss at 11pm shouldn't
 * count if the pro is a 9-to-5 painter — they're allowed to ignore
 * after-hours requests.
 *
 * The shape we read from `User.weeklySchedule` is:
 *   { dayOfWeek: 0-6 (Sun=0), isAvailable: bool, startHour: 0-23, endHour: 0-24 }
 * and overrides from `User.scheduleOverrides`:
 *   { date: 'YYYY-MM-DD', isBlocked: bool, startHour?, endHour? }
 *
 * Conservative default: if the pro has NO schedule set at all, we
 * assume 9-21 (matches the marketplace's general working hours) so
 * they're not completely shielded from the SLA via configuration
 * laziness. Once they set a schedule, that takes over.
 */

interface WeeklySlot {
  dayOfWeek: number;
  isAvailable: boolean;
  startHour: number;
  endHour: number;
}

interface ScheduleOverride {
  date: string;
  isBlocked: boolean;
  startHour?: number;
  endHour?: number;
}

interface SchedulableUser {
  weeklySchedule?: WeeklySlot[];
  scheduleOverrides?: ScheduleOverride[];
}

const DEFAULT_START_HOUR = 9;
const DEFAULT_END_HOUR = 21;

function toIsoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Resolve the working window for a specific calendar day. Returns
 * null when the day is fully blocked (override) or the weekly slot
 * is unavailable. Overrides take precedence over the weekly default.
 */
function getWindowForDate(
  user: SchedulableUser,
  date: Date,
): { startHour: number; endHour: number } | null {
  const isoDate = toIsoDate(date);
  const override = user.scheduleOverrides?.find((o) => o.date === isoDate);
  if (override) {
    if (override.isBlocked) return null;
    if (override.startHour != null && override.endHour != null) {
      return { startHour: override.startHour, endHour: override.endHour };
    }
    // Override exists but only blocks/unblocks - fall through to weekly.
  }

  const dow = date.getDay();
  const slot = user.weeklySchedule?.find((s) => s.dayOfWeek === dow);
  if (slot) {
    if (!slot.isAvailable) return null;
    return { startHour: slot.startHour, endHour: slot.endHour };
  }

  // No configured schedule - apply the marketplace default rather than
  // exempting fully. A pro who hasn't filled out hours is more likely
  // accountable than off-duty.
  return { startHour: DEFAULT_START_HOUR, endHour: DEFAULT_END_HOUR };
}

/**
 * True if the supplied moment falls within the pro's working window
 * on that calendar day.
 */
export function isWithinWorkingHours(
  user: SchedulableUser,
  moment: Date,
): boolean {
  const win = getWindowForDate(user, moment);
  if (!win) return false;
  const hour = moment.getHours();
  return hour >= win.startHour && hour < win.endHour;
}

/**
 * Add `minutes` of working time to `from`, walking forward day-by-day
 * and skipping non-working windows. Used to compute SLA deadlines that
 * pause overnight. Capped at 14 days of lookahead so a misconfigured
 * blocked schedule can't infinite-loop the caller.
 */
export function addBusinessMinutes(
  user: SchedulableUser,
  from: Date,
  minutes: number,
): Date {
  let remaining = minutes;
  let cursor = new Date(from);
  const MAX_DAYS_AHEAD = 14;
  const startDay = new Date(from);
  startDay.setHours(0, 0, 0, 0);

  while (remaining > 0) {
    const daysSinceStart =
      (cursor.getTime() - startDay.getTime()) / (24 * 60 * 60 * 1000);
    if (daysSinceStart > MAX_DAYS_AHEAD) {
      // Safety: a fully-blocked schedule shouldn't crash the cron.
      // Return the wall-clock deadline as a fallback.
      return new Date(from.getTime() + minutes * 60 * 1000);
    }

    const win = getWindowForDate(user, cursor);
    if (!win) {
      // Day is fully off - advance to the start of the next day.
      cursor = new Date(cursor);
      cursor.setHours(0, 0, 0, 0);
      cursor.setDate(cursor.getDate() + 1);
      continue;
    }

    const winStart = new Date(cursor);
    winStart.setHours(win.startHour, 0, 0, 0);
    const winEnd = new Date(cursor);
    winEnd.setHours(win.endHour, 0, 0, 0);

    if (cursor < winStart) {
      // Before the day's window - jump to its start.
      cursor = winStart;
      continue;
    }
    if (cursor >= winEnd) {
      // After the day's window - jump to next day's start.
      cursor = new Date(cursor);
      cursor.setHours(0, 0, 0, 0);
      cursor.setDate(cursor.getDate() + 1);
      continue;
    }

    const minutesLeftToday = Math.floor(
      (winEnd.getTime() - cursor.getTime()) / 60000,
    );
    if (remaining <= minutesLeftToday) {
      return new Date(cursor.getTime() + remaining * 60 * 1000);
    }
    remaining -= minutesLeftToday;
    cursor = new Date(cursor);
    cursor.setHours(0, 0, 0, 0);
    cursor.setDate(cursor.getDate() + 1);
  }

  return cursor;
}
