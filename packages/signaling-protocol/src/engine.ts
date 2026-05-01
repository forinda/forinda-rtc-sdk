/**
 * `SignalingEngine` — config holder + Session factory.
 *
 * The engine is the single place to configure protocol-wide policy
 * (auth, room capacity). It produces independent {@link Session} runtimes
 * via {@link SignalingEngine.openSession}; sessions do not share state with
 * each other, which makes per-test isolation trivial.
 *
 * Public API: prefer {@link defineSignalingEngine} over `new SignalingEngine(...)`
 * — declarative factory style is the project convention. The class is
 * exported for type imports and `instanceof` checks only.
 */

import { Session, type AuthenticateFn } from "./session.ts";

/** Options passed to {@link defineSignalingEngine} / `new SignalingEngine()`. */
export interface SignalingEngineOptions {
  /** Maximum peers per room. Defaults to 50 (see `Session.DEFAULT_MAX_PEERS_PER_ROOM`). */
  maxPeersPerRoom?: number;
  /** Optional auth check called on every join. Default: allow all. */
  authenticate?: AuthenticateFn;
}

/**
 * Engine class. Use {@link defineSignalingEngine} as the recommended
 * call style; this class is also exported for type imports and `instanceof`.
 */
export class SignalingEngine {
  private readonly options: SignalingEngineOptions;

  constructor(options: SignalingEngineOptions = {}) {
    this.options = options;
  }

  /**
   * Create a fresh, isolated {@link Session}. Each session has its own room
   * map and socket registry — no shared state with sibling sessions, which
   * makes per-test isolation easy and supports running multiple independent
   * SDK instances inside one process if needed.
   */
  openSession(): Session {
    return new Session(this.options);
  }
}

/**
 * Declarative factory for {@link SignalingEngine}. The recommended way to
 * construct an engine — keeps call sites declarative and matches the rest of
 * the SDK's `defineX({...})` style.
 *
 * ```ts
 * const engine = defineSignalingEngine({
 *   authenticate: async (token, room) => verifyJwt(token),
 *   maxPeersPerRoom: 50,
 * });
 * const session = engine.openSession();
 * ```
 */
export function defineSignalingEngine(opts: SignalingEngineOptions = {}): SignalingEngine {
  return new SignalingEngine(opts);
}
