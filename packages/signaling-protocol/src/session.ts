/**
 * `Session` — the per-process runtime that owns rooms, peer state, and the
 * outbound `onSend` channel.
 *
 * One `Session` is created via `defineSignalingEngine(...).openSession()`
 * (see `./engine.ts`). It accepts three categories of input from its host:
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

import { SignalingMessage, type SignalingMessageType } from "./messages.ts";
import { SignalingValidationError } from "./errors.ts";
import { defineRoom, type Room } from "./rooms.ts";
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
 *
 * Prefer {@link defineSession} as the primary call style; this class is
 * also exported for type imports and `instanceof` checks.
 */
export class Session {
  private readonly maxPeersPerRoom: number;
  private readonly authenticate: AuthenticateFn | undefined;
  private readonly sockets = new Map<SocketId, SocketRecord>();
  private readonly roomMap = new Map<RoomId, Room>();
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
   * Snapshot of all rooms and their peers. Each room snapshot is independent
   * of the live state — mutating it has no effect on the session.
   */
  rooms(): readonly RoomSnapshot[] {
    return [...this.roomMap.values()].map((room) => ({
      roomId: room.id,
      peers: room.peers(),
    }));
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
   * Process one inbound message from a socket. The string is parsed as JSON
   * and validated against {@link "./messages.ts".SignalingMessage}; failures
   * throw {@link SignalingValidationError}. Successful messages are
   * dispatched by `type` to the corresponding internal handler.
   */
  async handleMessage(socketId: SocketId, raw: string): Promise<void> {
    const socket = this.sockets.get(socketId);
    if (socket === undefined) {
      throw new SignalingValidationError(`unknown socket ${socketId}`, {
        context: { socketId },
      });
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch (cause) {
      throw new SignalingValidationError("message is not valid JSON", {
        cause,
        context: { socketId },
      });
    }

    const result = SignalingMessage.safeParse(parsed);
    if (!result.success) {
      throw new SignalingValidationError("message failed schema validation", {
        cause: result.error,
        context: { socketId, parsed },
      });
    }
    const message = result.data;

    switch (message.type) {
      case "join":
        await this.applyJoin(socket, message);
        return;
      default:
        // Other message types added in later tasks.
        throw new SignalingValidationError(`unsupported message type ${message.type}`, {
          context: { socketId, type: message.type },
        });
    }
  }

  /**
   * Internal: registers the peer in the room and broadcasts `peer-joined`
   * notifications both ways (to existing peers about the joiner, and to the
   * joiner about each existing peer). Authentication wiring is added in
   * Task 11; capacity enforcement is delegated to {@link Room.add}.
   */
  private async applyJoin(
    socket: SocketRecord,
    message: Extract<SignalingMessageType, { type: "join" }>,
  ): Promise<void> {
    const room = this.getOrCreateRoom(message.room);
    const existingPeers = room.peers();

    socket.peerId = message.peer;
    socket.roomId = message.room;
    room.add({ peerId: message.peer, socketId: socket.socketId, role: message.role });

    // Tell each existing peer about the new joiner.
    for (const existing of existingPeers) {
      this.send(existing.peerId, {
        type: "peer-joined",
        peer: message.peer,
        role: message.role,
      });
    }
    // Tell the new joiner about each existing peer.
    for (const existing of existingPeers) {
      this.send(message.peer, {
        type: "peer-joined",
        peer: existing.peerId,
        role: existing.role,
      });
    }
  }

  /** Lazy room creation. Capacity propagates from session options. */
  private getOrCreateRoom(roomId: RoomId): Room {
    let room = this.roomMap.get(roomId);
    if (room === undefined) {
      room = defineRoom({ id: roomId, capacity: this.maxPeersPerRoom });
      this.roomMap.set(roomId, room);
    }
    return room;
  }

  /**
   * Internal helper: deliver one outbound message to a peer via the registered
   * `onSend` handler. No-op if no handler is registered (host hasn't wired
   * delivery yet).
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
