/**
 * `ConnectionState` lifecycle + `StateMachine` enforcer.
 *
 * Every Publisher and Viewer carries one `StateMachine` whose transitions
 * are constrained by the table below. The enforcer rejects forbidden
 * transitions (returns `false`) so consumers see only meaningful state
 * progressions — no `connected -> connecting` jitter, no resurrected
 * `closed` instances.
 *
 * Allowed transitions:
 *
 *   idle         -> connecting | closed
 *   connecting   -> connected | failed | closed
 *   connected    -> reconnecting | failed | closed
 *   reconnecting -> connected | failed | closed
 *   failed       -> reconnecting | closed
 *   closed       -> (none)
 *
 * Idempotent same-state writes succeed silently (no event fired) so
 * consumers can call `transition(s)` defensively without spurious churn.
 */

/** Six-state lifecycle exposed to consumers via Publisher/Viewer state events. */
export type ConnectionState =
  | "idle"
  | "connecting"
  | "connected"
  | "reconnecting"
  | "failed"
  | "closed";

const TRANSITIONS: Record<ConnectionState, readonly ConnectionState[]> = {
  idle: ["connecting", "closed"],
  connecting: ["connected", "failed", "closed"],
  connected: ["reconnecting", "failed", "closed"],
  reconnecting: ["connected", "failed", "closed"],
  failed: ["reconnecting", "closed"],
  closed: [],
};

export interface StateMachineOptions {
  initial?: ConnectionState;
}

/**
 * Lifecycle enforcer. Use `transition(to)` to attempt a state change;
 * returns `true` if the transition was allowed (and fires change events
 * unless the new state equals the current one), `false` otherwise.
 *
 * Prefer {@link defineStateMachine} as the call style.
 */
export class StateMachine {
  private state: ConnectionState;
  private readonly handlers = new Set<(state: ConnectionState) => void>();

  constructor(opts: StateMachineOptions = {}) {
    this.state = opts.initial ?? "idle";
  }

  /** Read the current state. */
  current(): ConnectionState {
    return this.state;
  }

  /**
   * Attempt to transition to `to`. Returns `true` if allowed (or already in
   * `to`); `false` if forbidden by the transition table. Emits change
   * events only on real transitions, not on idempotent same-state writes.
   */
  transition(to: ConnectionState): boolean {
    if (this.state === to) return true;
    const allowed = TRANSITIONS[this.state];
    if (!allowed.includes(to)) return false;
    this.state = to;
    for (const handler of this.handlers) {
      try {
        handler(to);
      } catch {
        // Listener exceptions are swallowed (logged by Emitter elsewhere).
      }
    }
    return true;
  }

  /** Subscribe to state changes. Returns an unsubscribe. */
  on(handler: (state: ConnectionState) => void): () => void {
    this.handlers.add(handler);
    return () => {
      this.handlers.delete(handler);
    };
  }
}

/**
 * Declarative factory for {@link StateMachine}.
 *
 * ```ts
 * const sm = defineStateMachine({ initial: "idle" });
 * sm.on((s) => console.log(s));
 * sm.transition("connecting");
 * ```
 */
export function defineStateMachine(opts: StateMachineOptions = {}): StateMachine {
  return new StateMachine(opts);
}
