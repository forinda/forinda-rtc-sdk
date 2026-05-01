/**
 * `Session` — the per-process runtime that owns rooms, peer state, and the
 * outbound `onSend` channel.
 *
 * One `Session` is created via `engine.openSession()` (see `./engine.ts`).
 * It accepts three categories of input from its host:
 *
 *   1. Socket lifecycle: {@link Session.handleConnection}, {@link Session.handleDisconnect}
 *   2. Inbound messages: {@link Session.handleMessage} (raw JSON string)
 *   3. Outbound channel registration: {@link Session.onSend}
 *
 * The Session itself does no I/O. It validates inbound messages with the
 * zod schema, mutates internal room/peer state, and asks the registered
 * `SendHandler` to deliver outbound messages by peerId. Hosts (Node `ws`,
 * Express, Hono, Bun, Cloudflare Workers, etc.) are responsible for binding
 * peerIds to actual socket writes.
 *
 * Construction with no options yields an unauthenticated session with the
 * default room capacity ({@link DEFAULT_MAX_PEERS_PER_ROOM} = 50). Real hosts
 * almost always pass an `authenticate` callback.
 *
 * State invariants:
 * - At most one `onSend` handler is registered at a time. Re-registering
 *   throws (use the returned unsubscribe first). This avoids accidental
 *   double-delivery in tests and host code.
 * - A socket may bind at most one (peerId, roomId). Joining a second room
 *   from the same socket replaces the binding silently — by design for v0.1.0.
 * - `handleDisconnect` always succeeds (no-op for unknown sockets) so the
 *   host can call it from a `finally` block without try/catch ceremony.
 */

import type { SignalingMessageType } from "./messages.ts";
import type { PeerId, RoomId, RoomSnapshot, SendHandler, SocketId } from "./types.ts";

/**
 * Authentication callback shape. Returns `true` to allow a join, `false` to
 * reject (engine throws `SignalingAuthError`). The callback receives the
 * token the host attached at `handleConnection` time and the room the peer
 * is trying to enter — enough to enforce per-room ACLs.
 */
export type AuthenticateFn = (
  token: string | undefined,
  room: string,
) => boolean | Promise<boolean>;

/** Session constructor options. */
export interface SessionOptions {
  /** Maximum simultaneous peers per room. Defaults to {@link DEFAULT_MAX_PEERS_PER_ROOM}. */
  maxPeersPerRoom?: number;
  /** Pluggable auth check called when a peer attempts a join. Default: allow all. */
  authenticate?: AuthenticateFn;
}

/**
 * Information the host attaches when a new socket connects. The `token` is
 * passed verbatim to `authenticate(token, room)` on a subsequent join.
 */
export interface SocketInfo {
  token?: string;
}

/**
 * Internal per-socket record. Tracks the optional auth token plus the
 * peer/room binding once the socket has joined. Not exported — the public
 * surface is the `Session` class itself.
 */
interface SocketRecord extends SocketInfo {
  socketId: SocketId;
  /** Set when the socket has joined a room. */
  peerId?: PeerId;
  /** Set when the socket has joined a room. */
  roomId?: RoomId;
}

/**
 * Default room capacity. The spec calls for 50; hosts override per-engine
 * via `SignalingEngineOptions.maxPeersPerRoom`.
 */
export const DEFAULT_MAX_PEERS_PER_ROOM = 50;

/**
 * Per-process signaling state holder. See file-header docstring for the
 * lifecycle and invariants.
 */
export class Session {
  private readonly maxPeersPerRoom: number;
  private readonly authenticate: AuthenticateFn | undefined;
  private readonly sockets = new Map<SocketId, SocketRecord>();
  private sendHandler: SendHandler | undefined;

  constructor(opts: SessionOptions = {}) {
    this.maxPeersPerRoom = opts.maxPeersPerRoom ?? DEFAULT_MAX_PEERS_PER_ROOM;
    this.authenticate = opts.authenticate;
  }

  /** Number of currently registered sockets. */
  socketCount(): number {
    return this.sockets.size;
  }

  /**
   * Snapshot of all rooms and their peers. Returns an empty array until
   * Task 6 wires room creation through `handleMessage(JoinRoom)`.
   */
  rooms(): readonly RoomSnapshot[] {
    return [];
  }

  /**
   * Register the host's outbound delivery callback. Returns an unsubscribe.
   * Throws if a handler is already registered — call the returned function
   * first if you need to swap handlers.
   */
  onSend(handler: SendHandler): () => void {
    if (this.sendHandler !== undefined) {
      throw new Error("onSend handler already registered; call the returned unsubscribe first");
    }
    this.sendHandler = handler;
    return () => {
      if (this.sendHandler === handler) {
        this.sendHandler = undefined;
      }
    };
  }

  /**
   * Notify the engine that a transport-level connection has opened. Idempotent
   * for the same `socketId`; updates the stored token if the second call
   * carries a non-empty one.
   */
  async handleConnection(socketId: SocketId, info: SocketInfo): Promise<void> {
    const existing = this.sockets.get(socketId);
    if (existing !== undefined) {
      if (info.token !== undefined) existing.token = info.token;
      return;
    }
    const record: SocketRecord = { socketId };
    if (info.token !== undefined) record.token = info.token;
    this.sockets.set(socketId, record);
  }

  /**
   * Internal helper: deliver one outbound message to a peer via the registered
   * `onSend` handler. No-op if no handler is registered (host hasn't wired
   * delivery yet). Made `protected`-style by being an instance method (not
   * exported) but kept private for v0.1.0.
   */
  private send(peerId: PeerId, message: SignalingMessageType): void {
    this.sendHandler?.(peerId, message);
  }
}

/**
 * Declarative factory for {@link Session}. Prefer this over `new Session(...)`
 * in consumer code — keeps call sites declarative and matches the convention
 * used across the SDK (`defineSignalingEngine`, `definePublisher`, etc.).
 *
 * ```ts
 * const session = defineSession({ maxPeersPerRoom: 50, authenticate });
 * ```
 */
export function defineSession(opts: SessionOptions = {}): Session {
  return new Session(opts);
}
