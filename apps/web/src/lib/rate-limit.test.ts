import { describe, expect, it } from 'vitest';
import { clientIdentifier, FixedWindowRateLimiter } from './rate-limit';

describe('FixedWindowRateLimiter', () => {
  it('limits requests within a window and reports the actual retry delay', () => {
    const limiter = new FixedWindowRateLimiter(2, 60_000, 10);
    expect(limiter.check('visitor', 1_000).limited).toBe(false);
    expect(limiter.check('visitor', 20_000).limited).toBe(false);
    expect(limiter.check('visitor', 31_001)).toEqual({ limited: true, retryAfterSeconds: 30 });
  });

  it('resets an expired window', () => {
    const limiter = new FixedWindowRateLimiter(1, 1_000, 10);
    expect(limiter.check('visitor', 0).limited).toBe(false);
    expect(limiter.check('visitor', 999).limited).toBe(true);
    expect(limiter.check('visitor', 1_000).limited).toBe(false);
  });

  it('bounds memory even when every request supplies a new identifier', () => {
    const limiter = new FixedWindowRateLimiter(2, 60_000, 3);
    for (const key of ['a', 'b', 'c', 'd', 'e']) limiter.check(key, 0);
    expect(limiter.size).toBe(3);
    expect(limiter.check('a', 1).limited).toBe(false);
    expect(limiter.size).toBe(3);
  });

  it('removes expired buckets before evicting active ones', () => {
    const limiter = new FixedWindowRateLimiter(1, 100, 2);
    limiter.check('expired', 0);
    limiter.check('active', 50);
    limiter.check('new', 100);
    expect(limiter.size).toBe(2);
    expect(limiter.check('active', 101).limited).toBe(true);
  });
});

describe('clientIdentifier', () => {
  it('uses only a plausible first forwarded address', () => {
    expect(clientIdentifier(' 2001:DB8::1, 10.0.0.1')).toBe('2001:db8::1');
    expect(clientIdentifier('203.0.113.4, 198.51.100.2')).toBe('203.0.113.4');
  });

  it('collapses absent or attacker-controlled values to a bounded key', () => {
    expect(clientIdentifier(null)).toBe('unknown');
    expect(clientIdentifier('attacker-controlled-value')).toBe('unknown');
    expect(clientIdentifier('1'.repeat(65))).toBe('unknown');
  });
});