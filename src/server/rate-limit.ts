/**
 * Fixed-window in-memory rate limiter.
 *
 * Deliberately simple and honest about its trade-off: it is per-instance, so
 * on a multi-region deploy it would be swapped for Redis/Upstash. It still
 * stops the obvious abuse of the AI and booking endpoints in a single-instance
 * deployment, and documents the intent.
 */

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

export function rateLimit(
  key: string,
  { limit = 20, windowMs = 60_000 } = {},
): { ok: boolean; remaining: number; resetAt: number } {
  const now = Date.now();
  const bucket = buckets.get(key);

  if (!bucket || bucket.resetAt <= now) {
    const fresh = { count: 1, resetAt: now + windowMs };
    buckets.set(key, fresh);
    return { ok: true, remaining: limit - 1, resetAt: fresh.resetAt };
  }

  bucket.count += 1;
  return {
    ok: bucket.count <= limit,
    remaining: Math.max(0, limit - bucket.count),
    resetAt: bucket.resetAt,
  };
}

export function clientKey(request: Request, scope: string): string {
  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    request.headers.get('x-real-ip') ??
    'anonymous';
  return `${scope}:${ip}`;
}

/** Periodic sweep so the map cannot grow without bound. */
if (typeof setInterval !== 'undefined') {
  setInterval(() => {
    const now = Date.now();
    for (const [key, bucket] of buckets) if (bucket.resetAt <= now) buckets.delete(key);
  }, 300_000).unref?.();
}
