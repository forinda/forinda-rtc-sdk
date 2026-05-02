/**
 * Tiny exponential backoff helper for transport-layer reconnect.
 *
 * Separate from `RetryPolicy` in core because transport reconnect is
 * unbounded (loops forever; session-level retries handle the user-visible
 * give-up). Computes one delay per call given the attempt index.
 */

export interface BackoffOptions {
  initialMs?: number;
  maxMs?: number;
  /** Random jitter range as fraction of computed delay. Default `0.25`. */
  jitter?: number;
}

const DEFAULTS: Required<BackoffOptions> = {
  initialMs: 1000,
  maxMs: 30_000,
  jitter: 0.25,
};

/**
 * Compute the next backoff delay in milliseconds for the given attempt
 * index (0-based — attempt 0 is the first reconnect after a drop).
 */
export function nextBackoff(attempt: number, opts: BackoffOptions = {}): number {
  const { initialMs, maxMs, jitter } = { ...DEFAULTS, ...opts };
  const expBase = initialMs * Math.pow(2, attempt);
  const capped = Math.min(expBase, maxMs);
  const jitterRange = capped * jitter;
  const jitterDelta = (Math.random() * 2 - 1) * jitterRange;
  return Math.max(0, Math.round(capped + jitterDelta));
}
