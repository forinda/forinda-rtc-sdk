/**
 * Tiny typed event emitter — the only event mechanism the SDK uses.
 *
 * Why hand-roll instead of `eventemitter3` or `nanoevents`:
 * - Zero deps in `core` is a stated goal; this is ~50 LOC.
 * - We need *typed* events keyed by an event-name -> payload map.
 *
 * Behavior:
 * - Listeners run in registration order.
 * - Listener exceptions are caught and forwarded to `getLogger().error` so
 *   one bad listener can't poison sibling listeners or the emitter.
 * - `once` wraps the listener so it auto-unregisters after first invocation.
 */

import { getLogger } from "@/logger/logger.ts";

/** Map from event name to payload type. Used as a generic constraint. */
export type EventMap = Record<string, unknown>;

/** Listener signature for a specific event payload. */
export type Listener<T> = (payload: T) => void;

/**
 * Typed emitter. Generic parameter is an `EventMap` — an interface mapping
 * event names to their payload types.
 *
 * ```ts
 * interface PublisherEvents { state: ConnectionState; viewer: { peerId: string } }
 * const emitter = defineEmitter<PublisherEvents>();
 * emitter.on("state", (s) => { /* s is ConnectionState *​/ });
 * ```
 *
 * Prefer {@link defineEmitter} as the call style; the class is exported for
 * type imports & `instanceof`.
 */
export class Emitter<E extends EventMap> {
  private readonly listeners = new Map<keyof E, Set<Listener<unknown>>>();

  /** Subscribe to an event. Returns an unsubscribe. */
  on<K extends keyof E>(event: K, listener: Listener<E[K]>): () => void {
    let bucket = this.listeners.get(event);
    if (bucket === undefined) {
      bucket = new Set();
      this.listeners.set(event, bucket);
    }
    bucket.add(listener as Listener<unknown>);
    return () => this.off(event, listener);
  }

  /** Subscribe for a single invocation, then auto-unregister. */
  once<K extends keyof E>(event: K, listener: Listener<E[K]>): () => void {
    const off = this.on(event, (payload) => {
      off();
      listener(payload);
    });
    return off;
  }

  /** Unsubscribe a previously registered listener. No-op if not registered. */
  off<K extends keyof E>(event: K, listener: Listener<E[K]>): void {
    const bucket = this.listeners.get(event);
    if (bucket === undefined) return;
    bucket.delete(listener as Listener<unknown>);
    if (bucket.size === 0) this.listeners.delete(event);
  }

  /**
   * Synchronously invoke every listener for `event` with `payload`. Listener
   * exceptions are caught and logged; they never throw out of `emit`.
   */
  emit<K extends keyof E>(event: K, payload: E[K]): void {
    const bucket = this.listeners.get(event);
    if (bucket === undefined) return;
    // Snapshot so listeners that mutate the bucket mid-emit don't shift iteration.
    const snapshot = [...bucket];
    for (const listener of snapshot) {
      try {
        (listener as Listener<E[K]>)(payload);
      } catch (cause) {
        getLogger().error("emitter listener threw", { event: String(event), cause });
      }
    }
  }

  /** Remove every listener for `event`, or every listener of every event. */
  removeAllListeners<K extends keyof E>(event?: K): void {
    if (event === undefined) {
      this.listeners.clear();
      return;
    }
    this.listeners.delete(event);
  }
}

/**
 * Declarative factory for {@link Emitter}. Recommended call style.
 *
 * ```ts
 * const emitter = defineEmitter<MyEvents>();
 * ```
 */
export function defineEmitter<E extends EventMap>(): Emitter<E> {
  return new Emitter<E>();
}
