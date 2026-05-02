/**
 * Pluggable logger for the SDK.
 *
 * Default implementation is a noop — the SDK never logs anything until the
 * consumer opts in via `setLogger(impl)`. This avoids polluting consumer
 * consoles and makes tests deterministic.
 *
 * Every error path in the SDK calls `getLogger().error(msg, ctx)` exactly
 * once with enough context (peerId, room, attempt, iceState, etc.) that
 * one log line is debuggable without enabling trace.
 */

/**
 * Logger contract. All methods accept an optional structured context map.
 * Implementations should treat `ctx` as opaque — no schema enforcement.
 */
export interface Logger {
  trace(msg: string, ctx?: Record<string, unknown>): void;
  debug(msg: string, ctx?: Record<string, unknown>): void;
  info(msg: string, ctx?: Record<string, unknown>): void;
  warn(msg: string, ctx?: Record<string, unknown>): void;
  error(msg: string, ctx?: unknown): void;
}

/** No-op logger used until the consumer opts in. */
export const defaultLogger: Logger = {
  trace() {},
  debug() {},
  info() {},
  warn() {},
  error() {},
};

let activeLogger: Logger = defaultLogger;

/**
 * Replace the active logger. Pass {@link defaultLogger} to restore the
 * silent default (useful in test cleanup).
 */
export function setLogger(impl: Logger): void {
  activeLogger = impl;
}

/**
 * Read the active logger. Internal call sites should always go through this
 * (not the captured module-level `activeLogger`) so swaps mid-test take
 * effect.
 */
export function getLogger(): Logger {
  return activeLogger;
}
