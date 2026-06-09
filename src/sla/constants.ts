/**
 * SLA (Service-Level Agreement) accountability constants.
 *
 * The numbers here are the entire policy surface for the pro
 * accountability system. Centralised so a product change ("relax the
 * chat SLA to 90 min", "shorten the pause to 24h") is a single-edit.
 *
 * See `~/.claude/plans/staged-crunching-meadow.md` for the design.
 */

// ── Deadlines ──────────────────────────────────────────────────────────

/** How long a pro has to accept/decline a paid (PENDING) booking. */
export const SLA_BOOKING_ACCEPT_MIN = 30;

/** How long a pro has to reply to a client's project-chat message. */
export const SLA_CHAT_REPLY_MIN = 60;

/** How long a pro has to react to a direct job invitation. */
export const SLA_DIRECT_INVITE_MIN = 120;

// ── Ladder ─────────────────────────────────────────────────────────────

/**
 * Trailing window over which misses are counted toward the ladder.
 * A clean stretch longer than this resets the counter naturally.
 */
export const SLA_WINDOW_DAYS = 14;

/**
 * After hitting the demote threshold, the pro stays buried in search
 * results for this many days. Reset by the cron's next pass once the
 * expiry passes.
 */
export const SLA_DEMOTION_DAYS = 7;

/**
 * Pause length applied at the third miss in the window. Reuses the
 * existing `isProfileDeactivated` + `deactivatedUntil` machinery, so
 * the pro automatically reappears in search when the timer expires.
 */
export const SLA_PAUSE_HOURS = 48;

/**
 * Max entries to keep on `User.slaMisses`. Larger than the window so
 * we can show recent history to the pro in their dashboard without
 * needing a separate collection.
 */
export const SLA_MISSES_HISTORY_CAP = 30;

// ── Profile completeness ────────────────────────────────────────────────

/** Below this percent, the weekly cron fires the nag notification. */
export const PROFILE_INCOMPLETENESS_THRESHOLD_PCT = 60;

/** Don't re-nag a given pro within this many days. */
export const PROFILE_NAG_COOLDOWN_DAYS = 30;

// ── Enforcement gate ────────────────────────────────────────────────────

/**
 * Resolves whether to actually APPLY penalties on the user, or just
 * log them for observation. Phase A ships with this OFF so we can
 * validate the cron detects misses correctly before any pro is
 * affected. Flip via the `SLA_ENFORCEMENT_ENABLED` env var.
 */
export function isEnforcementEnabled(): boolean {
  return process.env.SLA_ENFORCEMENT_ENABLED === "true";
}

/**
 * Day to start counting misses from. Set on initial deploy (via env)
 * to avoid retroactively penalising events that predate the feature.
 * Returns null when unset, in which case the cron treats all events
 * as fair game (use only after the env var is in place).
 */
export function getFeatureLaunchDate(): Date | null {
  const raw = process.env.SLA_LAUNCH_DATE;
  if (!raw) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}
