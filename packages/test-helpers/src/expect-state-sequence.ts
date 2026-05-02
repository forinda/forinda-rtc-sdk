/**
 * `expectStateSequence` — async assertion helper that subscribes to a
 * state-emitting source and resolves once it has observed the requested
 * sequence in order.
 *
 * Two source shapes are supported, mirroring what core / react / elements
 * actually expose:
 *
 * - `{ on(event: "state", handler: (s: T) => void): () => void }` — the SDK
 *   `Publisher` / `Viewer` event-map shape.
 * - `(handler: (s: T) => void) => () => void` — a bare subscribe function,
 *   for cases where you've already partially-applied the event name.
 *
 * The expectation is satisfied as soon as the *last* state in the sequence
 * arrives. Intermediate non-matching states are tolerated — this is
 * deliberately a "saw these in order" assertion, not "saw exactly these and
 * nothing else." Use a strict comparison test if you need that.
 *
 * Throws (rejects) on timeout, including the states observed so far in the
 * error message — much easier to debug than a bare timeout.
 *
 * @example
 * ```ts
 * await expectStateSequence(publisher, ["connecting", "connected"]);
 * ```
 */

export type StateSource<T> =
  | { on(event: "state", handler: (state: T) => void): () => void }
  | ((handler: (state: T) => void) => () => void);

export interface ExpectStateSequenceOptions {
  /** Reject after this many ms. Default 2000. */
  timeoutMs?: number;
}

export function expectStateSequence<T>(
  source: StateSource<T>,
  sequence: readonly T[],
  options: ExpectStateSequenceOptions = {},
): Promise<void> {
  if (sequence.length === 0) {
    return Promise.reject(new Error("expectStateSequence: sequence must not be empty"));
  }

  const timeoutMs = options.timeoutMs ?? 2000;
  const observed: T[] = [];
  let cursor = 0;

  return new Promise<void>((resolve, reject) => {
    let unsubscribe: (() => void) | null = null;
    let pendingCleanup = false;

    const cleanup = (): void => {
      if (unsubscribe) unsubscribe();
      else pendingCleanup = true;
    };

    const timer = setTimeout(() => {
      cleanup();
      reject(
        new Error(
          `expectStateSequence: timed out after ${timeoutMs}ms. ` +
            `Expected ${JSON.stringify(sequence)}, observed ${JSON.stringify(observed)}.`,
        ),
      );
    }, timeoutMs);

    const handler = (state: T): void => {
      observed.push(state);
      if (cursor >= sequence.length) return;
      if (state === sequence[cursor]) {
        cursor += 1;
        if (cursor === sequence.length) {
          clearTimeout(timer);
          cleanup();
          resolve();
        }
      }
    };

    unsubscribe = typeof source === "function" ? source(handler) : source.on("state", handler);
    if (pendingCleanup) unsubscribe();
  });
}
