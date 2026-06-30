import { Request } from 'express';

/**
 * Real client IP behind the Cloudflare → Render proxy chain (two hops).
 *
 * `req.ip` only unwinds ONE hop (we set `trust proxy = 1`), so it returns
 * Cloudflare's edge IP — a handful of addresses shared by every visitor behind
 * the same PoP. Using it as a dedup key collapses all those distinct anonymous
 * visitors into a single "view" (the bug behind under-counted job/profile views).
 *
 * Cloudflare sets `cf-connecting-ip` to the true client IP and overwrites any
 * client-supplied value, so it's reliable and unspoofable. We fall back to the
 * left-most `X-Forwarded-For` entry, then Express's `req.ip`, so local/dev
 * environments (no Cloudflare) keep working exactly as before.
 */
export function getClientIp(req: Request): string {
  const cf = req.headers['cf-connecting-ip'];
  const cfValue = Array.isArray(cf) ? cf[0] : cf;
  if (cfValue && cfValue.length > 0) return cfValue;

  const xff = req.headers['x-forwarded-for'];
  const xffValue = Array.isArray(xff) ? xff[0] : xff;
  if (xffValue && xffValue.length > 0) {
    const first = xffValue.split(',')[0]?.trim();
    if (first) return first;
  }

  return req.ip || 'unknown';
}
