import { BadgeDefinition } from './badges.types';

/**
 * ── Badge registry (config-as-code) ─────────────────────────────────────────
 * The single source of truth for every badge. Adding a badge = adding one
 * entry below; as long as it reacts to an existing trigger there is nothing
 * else to wire. See BadgeContext (badges.types.ts) for the data a condition
 * can read.
 *
 * Examples ready to add later (one entry each):
 *   - first_client : audience 'pro', trigger 'booking.completed', condition (u.completedJobs >= 1)
 *   - ten_jobs     : audience 'pro', trigger 'booking.completed', condition (u.completedJobs >= 10)
 *   - top_rated    : audience 'pro', trigger 'review.created', condition (avgRating >= 4.8 && totalReviews >= 10)
 *   - verified_pro : audience 'pro', trigger 'profile.updated', condition (verificationStatus === 'verified')
 */
export const BADGE_REGISTRY: BadgeDefinition[] = [
  {
    key: 'first_review',
    audience: 'client',
    icon: 'message-square',
    titleKey: 'badges.first_review.title',
    descKey: 'badges.first_review.desc',
    triggers: ['review.created'],
    condition: async (ctx) => (await ctx.reviewsAuthoredCount()) >= 1,
  },
  {
    key: 'ten_jobs',
    audience: 'pro',
    icon: 'trophy',
    titleKey: 'badges.ten_jobs.title',
    descKey: 'badges.ten_jobs.desc',
    triggers: ['booking.completed'],
    condition: async (ctx) => ((await ctx.user())?.completedJobs ?? 0) >= 10,
  },
  {
    key: 'verified_pro',
    audience: 'pro',
    icon: 'badge-check',
    titleKey: 'badges.verified_pro.title',
    descKey: 'badges.verified_pro.desc',
    triggers: ['profile.updated'],
    condition: async (ctx) =>
      (await ctx.user())?.verificationStatus === 'verified',
  },
];

export const getBadge = (key: string): BadgeDefinition | undefined =>
  BADGE_REGISTRY.find((b) => b.key === key);
