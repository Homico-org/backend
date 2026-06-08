/**
 * Types for the badge engine. The whole system is driven by the registry
 * (badges.registry.ts): each badge is a plain definition with a condition.
 * To add a badge you add one entry — no engine changes needed.
 */

export type BadgeAudience = 'client' | 'pro' | 'all';

/**
 * Business signals that can unlock badges. Add a trigger here, then fire it
 * from the matching service (e.g. BadgesService.evaluate(userId, ['booking.completed'])).
 */
export type BadgeTrigger =
  | 'review.created'
  | 'booking.completed'
  | 'profile.updated';

/**
 * Everything a condition may need to decide whether a badge unlocks. Helpers
 * are injected by BadgesService so the registry stays pure config (no DI).
 */
export interface BadgeContext {
  userId: string;
  trigger: BadgeTrigger;
  /** Number of reviews this user has authored (as a client). */
  reviewsAuthoredCount: () => Promise<number>;
  /** The user document — pro stats live here: avgRating, totalReviews, completedJobs, verificationStatus. */
  user: () => Promise<any>;
}

export interface BadgeDefinition {
  /** Stable identifier, stored in user_badges.badgeKey. Never rename in place. */
  key: string;
  audience: BadgeAudience;
  /** Emoji or icon key, rendered by the frontend. */
  icon: string;
  /** i18n keys resolved on the client (en/ka/ru). */
  titleKey: string;
  descKey: string;
  /** Re-evaluate this badge whenever one of these triggers fires. */
  triggers: BadgeTrigger[];
  /** Returns true when the badge should be unlocked for the user in ctx. */
  condition: (ctx: BadgeContext) => Promise<boolean>;
}
