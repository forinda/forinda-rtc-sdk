/**
 * Internal helper: an externally-resolvable promise.
 *
 * Useful when one method needs to hand a promise to a caller and resolve it
 * from a callback (e.g. async event arrival). Avoids the slightly awkward
 * `new Promise((res, rej) => { ... })` capture pattern.
 */

/** Shape returned by {@link defineDeferred}. */
export interface Deferred<T> {
  readonly promise: Promise<T>;
  readonly resolve: (value: T) => void;
  readonly reject: (reason?: unknown) => void;
}

/** Build a fresh deferred. */
export function defineDeferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}
