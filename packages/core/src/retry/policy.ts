/**
 * Auto-retry policy: exponential backoff with jitter, bounded by attempt
 * count or wall-clock duration.
 *
 * Used by Publisher and Viewer (EPIC-3b) for session-level recovery from
 * signaling drops, ICE failures, or other transient session breakage.
 *
 * The policy is stateful: callers invoke `nextDelayMs()` to get the next
 * backoff (and consume one attempt), `markSuccess()` after a sustained
 * recovery to reset the counter, and `isExhausted()` to check whether the
 * budget is gone.
 */

/** Constructor options for {@link defineRetryPolicy}. All fields optional. */
export interface RetryConfig {
  /** Whether retries are enabled at all. Default `true`. */
  enabled?: boolean;
  /** Maximum number of retry attempts before exhaustion. Default `5`. */
  maxAttempts?: number;
  /** Maximum total wall-clock time across retries before exhaustion. Default `5 * 60_000`. */
  maxDurationMs?: number;
  /** Initial backoff delay. Default `1000`. */
  initialBackoffMs?: number;
  /** Maximum per-attempt delay (caps the exponential growth). Default `30_000`. */
  maxBackoffMs?: number;
  /** Jitter range as a fraction of the computed delay (e.g. 0.25 = ±25%). Default `0.25`. */
  jitter?: number;
  /** Sustained-`connected` window after which `markSuccess` resets the counter. Default `30_000`. */
  successResetMs?: number;
}

interface ResolvedConfig {
  enabled: boolean;
  maxAttempts: number;
  maxDurationMs: number;
  initialBackoffMs: number;
  maxBackoffMs: number;
  jitter: number;
  successResetMs: number;
}

const DEFAULTS: ResolvedConfig = {
  enabled: true,
  maxAttempts: 5,
  maxDurationMs: 5 * 60_000,
  initialBackoffMs: 1000,
  maxBackoffMs: 30_000,
  jitter: 0.25,
  successResetMs: 30_000,
};

function resolveConfig(opts: RetryConfig): ResolvedConfig {
  return {
    enabled: opts.enabled ?? DEFAULTS.enabled,
    maxAttempts: opts.maxAttempts ?? DEFAULTS.maxAttempts,
    maxDurationMs: opts.maxDurationMs ?? DEFAULTS.maxDurationMs,
    initialBackoffMs: opts.initialBackoffMs ?? DEFAULTS.initialBackoffMs,
    maxBackoffMs: opts.maxBackoffMs ?? DEFAULTS.maxBackoffMs,
    jitter: opts.jitter ?? DEFAULTS.jitter,
    successResetMs: opts.successResetMs ?? DEFAULTS.successResetMs,
  };
}

/**
 * Stateful retry budget. Construct via {@link defineRetryPolicy}; call
 * `nextDelayMs()` to advance one attempt; call `markSuccess()` once the
 * session has been sustainedly `connected`.
 */
export class RetryPolicy {
  private readonly config: ResolvedConfig;
  /** Number of attempts consumed so far. */
  attempt = 0;
  private firstAttemptAt: number | undefined;
  private lastAttemptAt: number | undefined;

  constructor(opts: RetryConfig = {}) {
    this.config = resolveConfig(opts);
  }

  /** Wall-clock ms since the first `nextDelayMs` call. `0` before any call. */
  get elapsedMs(): number {
    if (this.firstAttemptAt === undefined) return 0;
    return Date.now() - this.firstAttemptAt;
  }

  /**
   * Returns the next backoff delay in milliseconds, or `null` if the budget
   * is exhausted (disabled, max attempts, or max duration). Increments the
   * attempt counter on success.
   */
  nextDelayMs(): number | null {
    if (!this.config.enabled) return null;
    if (this.firstAttemptAt === undefined) {
      this.firstAttemptAt = Date.now();
    }
    if (this.attempt >= this.config.maxAttempts) return null;
    if (this.elapsedMs > this.config.maxDurationMs) return null;

    const expBase = this.config.initialBackoffMs * Math.pow(2, this.attempt);
    const capped = Math.min(expBase, this.config.maxBackoffMs);
    const jitterRange = capped * this.config.jitter;
    const jitterDelta = (Math.random() * 2 - 1) * jitterRange; // [-jitterRange, +jitterRange]
    const delay = Math.max(0, Math.round(capped + jitterDelta));

    this.attempt += 1;
    this.lastAttemptAt = Date.now();
    return delay;
  }

  /**
   * Note that the connection has been sustainedly `connected`. Resets the
   * attempt counter only if at least `successResetMs` has elapsed since the
   * most recent attempt — brief flaps don't drain the budget. No-op when
   * no attempts have been recorded yet.
   */
  markSuccess(): void {
    if (this.lastAttemptAt === undefined) return;
    const sinceLastAttempt = Date.now() - this.lastAttemptAt;
    if (sinceLastAttempt >= this.config.successResetMs) {
      this.attempt = 0;
      this.firstAttemptAt = undefined;
      this.lastAttemptAt = undefined;
    }
  }

  /** True when the budget is fully consumed. */
  isExhausted(): boolean {
    if (!this.config.enabled) return true;
    if (this.attempt >= this.config.maxAttempts) return true;
    if (this.elapsedMs > this.config.maxDurationMs) return true;
    return false;
  }
}

/**
 * Declarative factory for {@link RetryPolicy}.
 *
 * ```ts
 * const policy = defineRetryPolicy({ maxAttempts: 5, initialBackoffMs: 1000 });
 * const delay = policy.nextDelayMs();
 * if (delay === null) { /* give up *​/ }
 * ```
 */
export function defineRetryPolicy(opts: RetryConfig = {}): RetryPolicy {
  return new RetryPolicy(opts);
}
