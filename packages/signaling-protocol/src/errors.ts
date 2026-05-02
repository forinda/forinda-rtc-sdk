/**
 * Protocol-layer error hierarchy.
 *
 * Every error thrown from this package extends {@link SignalingProtocolError}
 * and carries a stable `code` string. Codes are the contract — class names
 * may be renamed in future major versions, codes will not. Consumers should
 * branch on `err.code === 'room_full'`, not `err instanceof RoomFullError`,
 * when crossing package boundaries.
 *
 * The hierarchy is intentionally narrow at the protocol layer (4 concrete
 * subclasses). The browser-side `@forinda/video-sdk-core` package wraps and
 * re-exports these alongside its own SDK-wide error tree.
 *
 *   SignalingProtocolError                     // root (rarely thrown directly)
 *   ├── SignalingValidationError               // bad JSON / failed zod parse
 *   ├── SignalingAuthError                     // authenticate() returned false
 *   ├── RoomFullError                          // capacity exceeded
 *   └── PeerNotFoundError                      // SDP/ICE target peer not registered
 *
 * Each error attaches optional `cause` (the underlying exception, if any)
 * and `context` (a free-form map carrying the offending socketId, room id,
 * peer id, etc.). Logged in one line, debuggable without enabling trace.
 */

/**
 * Constructor options for every {@link SignalingProtocolError} subclass.
 *
 * - `code` overrides the default per-subclass code (only the root respects this;
 *   subclasses always set their own and the option is intentionally `Omit`-ed
 *   from their public signatures so callers can't accidentally weaken them).
 * - `cause` is the underlying error this one wraps (e.g. a zod ZodError).
 * - `context` is a structured payload for logging (peer ids, socket ids, etc.).
 */
export interface SignalingErrorOptions {
  code?: string;
  cause?: unknown;
  context?: Record<string, unknown>;
}

/**
 * Root of the protocol error hierarchy. Carries a stable code (defaults to
 * `'signaling_protocol_error'` if not specified — subclasses always specify).
 */
export class SignalingProtocolError extends Error {
  readonly code: string;
  override readonly cause?: unknown;
  readonly context?: Record<string, unknown>;

  constructor(message: string, opts: SignalingErrorOptions = {}) {
    super(message);
    this.name = "SignalingProtocolError";
    this.code = opts.code ?? "signaling_protocol_error";
    if (opts.cause !== undefined) this.cause = opts.cause;
    if (opts.context !== undefined) this.context = opts.context;
  }
}

/**
 * Thrown when an inbound message is not valid JSON or fails the
 * {@link "./messages.ts".SignalingMessage} zod parse. `cause` holds the
 * underlying ZodError or SyntaxError so detailed reporting is possible.
 */
export class SignalingValidationError extends SignalingProtocolError {
  constructor(message: string, opts: Omit<SignalingErrorOptions, "code"> = {}) {
    super(message, { ...opts, code: "signaling_validation" });
    this.name = "SignalingValidationError";
  }
}

/**
 * Thrown by `applyJoin` when the engine's `authenticate(token, room)`
 * callback returns `false` for an attempted join. The peer is NOT registered;
 * the host should respond to the rejection however its transport prefers
 * (close socket, send a typed error frame, etc.).
 */
export class SignalingAuthError extends SignalingProtocolError {
  constructor(message: string, opts: Omit<SignalingErrorOptions, "code"> = {}) {
    super(message, { ...opts, code: "signaling_auth" });
    this.name = "SignalingAuthError";
  }
}

/**
 * Thrown when a join attempt would push a room past its `maxPeersPerRoom`
 * capacity. Originates inside {@link "./rooms.ts".Room.add} and bubbles
 * through `Session.handleMessage` unchanged.
 */
export class RoomFullError extends SignalingProtocolError {
  constructor(message: string, opts: Omit<SignalingErrorOptions, "code"> = {}) {
    super(message, { ...opts, code: "room_full" });
    this.name = "RoomFullError";
  }
}

/**
 * Thrown when an SDP or ICE message references a `to` peer the engine has
 * never seen. Hints at out-of-order delivery or a buggy client; the engine
 * does not retry — it surfaces the error so the host can log/alert.
 */
export class PeerNotFoundError extends SignalingProtocolError {
  constructor(message: string, opts: Omit<SignalingErrorOptions, "code"> = {}) {
    super(message, { ...opts, code: "peer_not_found" });
    this.name = "PeerNotFoundError";
  }
}

/**
 * Thrown when a peer's per-type rate-limit token bucket is empty. The
 * engine surfaces this immediately on `applyChat` / `applyPresenceUpdate`;
 * the message is NOT relayed. Hosts decide whether to surface it back to
 * the client (typed error frame, close code, etc.).
 */
export class SignalingRateLimitError extends SignalingProtocolError {
  constructor(message: string, opts: Omit<SignalingErrorOptions, "code"> = {}) {
    super(message, { ...opts, code: "rate_limited" });
    this.name = "SignalingRateLimitError";
  }
}

/**
 * Thrown when a peer attempts to claim `role: "director"` for a room that
 * already has a director. The engine enforces first-claim wins; co-directors
 * are added at runtime via the `promote` command.
 */
export class SignalingDirectorConflictError extends SignalingProtocolError {
  constructor(message: string, opts: Omit<SignalingErrorOptions, "code"> = {}) {
    super(message, { ...opts, code: "director_conflict" });
    this.name = "SignalingDirectorConflictError";
  }
}

/**
 * Thrown when a non-director peer issues a director-only command
 * (`mute`, `unmute`, `kick`, `promote`, `demote`, `set-bitrate`) AND the
 * engine has `enforceModerationCommands: true`. With enforcement off the
 * engine relays such commands honor-based (the target decides whether to
 * obey).
 */
export class SignalingPermissionError extends SignalingProtocolError {
  constructor(message: string, opts: Omit<SignalingErrorOptions, "code"> = {}) {
    super(message, { ...opts, code: "not_authorized" });
    this.name = "SignalingPermissionError";
  }
}
