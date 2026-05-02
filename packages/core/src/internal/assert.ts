/**
 * Internal invariant helper.
 *
 * Use for "this should never happen" conditions inside SDK internals — not
 * for boundary validation (boundary errors should be typed `SdkError`
 * subclasses instead). A failed invariant indicates a bug, not user error.
 */

/**
 * Throws if `cond` is falsy. Message is prefixed with `Invariant:` so it's
 * easy to grep stack traces for these failures.
 */
export function invariant(cond: unknown, msg: string): asserts cond {
  if (!cond) {
    throw new Error(`Invariant: ${msg}`);
  }
}
