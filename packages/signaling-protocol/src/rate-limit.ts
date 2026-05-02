/**
 * `TokenBucket` — a leaky-bucket rate limiter (token-bucket flavor).
 *
 * One bucket holds up to `capacity` tokens and refills at `refillPerSec`
 * tokens/second. `consume()` returns `true` when a token was available and
 * deducted, `false` otherwise. The bucket is purely time-driven — there are
 * no timers, no scheduled refills. Each `consume()` reads `now()` and
 * computes the time-since-last-refill credit on demand.
 *
 * `refillPerSec === 0` disables refill entirely (the bucket can be drained
 * once and never recovers — useful for "block after first violation" semantics
 * if needed). The same `defineTokenBucket({})` shape stays valid either way.
 *
 * The Session uses two buckets per peer (chat + presence) to enforce
 * per-message-type quotas without one channel draining the other.
 */

export interface TokenBucketOptions {
  /** Maximum tokens the bucket can hold. Burst allowance equals capacity. */
  capacity: number;
  /** Tokens added per second. `0` disables refill. */
  refillPerSec: number;
  /** Test seam — defaults to `Date.now`. */
  now?: () => number;
}

export interface TokenBucket {
  /** Try to take one token. Returns `true` on success, `false` when empty. */
  consume(): boolean;
}

class TokenBucketImpl implements TokenBucket {
  private readonly capacity: number;
  private readonly refillPerMs: number;
  private readonly now: () => number;
  private tokens: number;
  private lastRefillAt: number;

  constructor(opts: TokenBucketOptions) {
    this.capacity = opts.capacity;
    this.refillPerMs = opts.refillPerSec / 1000;
    this.now = opts.now ?? Date.now;
    this.tokens = opts.capacity;
    this.lastRefillAt = this.now();
  }

  consume(): boolean {
    this.refill();
    if (this.tokens < 1) return false;
    this.tokens -= 1;
    return true;
  }

  private refill(): void {
    if (this.refillPerMs === 0) return;
    const t = this.now();
    const elapsed = t - this.lastRefillAt;
    if (elapsed <= 0) return;
    const credit = elapsed * this.refillPerMs;
    this.tokens = Math.min(this.capacity, this.tokens + credit);
    this.lastRefillAt = t;
  }
}

export function defineTokenBucket(opts: TokenBucketOptions): TokenBucket {
  return new TokenBucketImpl(opts);
}
