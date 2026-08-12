export type RateLimitResult = { limited: boolean; retryAfterSeconds: number };

type Bucket = { count: number; resetAt: number };

/**
 * A bounded fixed-window limiter for best-effort protection of public routes.
 * Expired entries are removed before capacity eviction so untrusted client
 * identifiers cannot grow server memory without bound.
 */
export class FixedWindowRateLimiter {
  private readonly buckets = new Map<string, Bucket>();

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
    private readonly maxBuckets: number,
  ) {
    if (!Number.isInteger(limit) || limit < 1) throw new Error('limit must be a positive integer');
    if (!Number.isFinite(windowMs) || windowMs < 1) throw new Error('windowMs must be positive');
    if (!Number.isInteger(maxBuckets) || maxBuckets < 1) throw new Error('maxBuckets must be a positive integer');
  }

  check(key: string, now = Date.now()): RateLimitResult {
    const existing = this.buckets.get(key);
    if (existing && existing.resetAt > now) {
      existing.count += 1;
      return {
        limited: existing.count > this.limit,
        retryAfterSeconds: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)),
      };
    }

    if (existing) this.buckets.delete(key);
    this.makeRoom(now);
    this.buckets.set(key, { count: 1, resetAt: now + this.windowMs });
    return { limited: false, retryAfterSeconds: Math.ceil(this.windowMs / 1000) };
  }

  get size(): number {
    return this.buckets.size;
  }

  private makeRoom(now: number) {
    for (const [key, bucket] of this.buckets) {
      if (bucket.resetAt <= now) this.buckets.delete(key);
    }
    while (this.buckets.size >= this.maxBuckets) {
      const oldestKey = this.buckets.keys().next().value as string | undefined;
      if (oldestKey === undefined) break;
      this.buckets.delete(oldestKey);
    }
  }
}

/** Bounds attacker-controlled forwarding values while keeping rate-limit keys stable. */
export function clientIdentifier(forwardedFor: string | null): string {
  const first = forwardedFor?.split(',', 1)[0]?.trim();
  if (!first || first.length > 64 || !/^[0-9a-f:.]+$/i.test(first)) return 'unknown';
  return first.toLowerCase();
}
