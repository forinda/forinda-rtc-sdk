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
import {
  PeerNotFoundError,
  SignalingAuthError,
  SignalingRateLimitError,
  SignalingValidationError,
} from "./errors.ts";
import { defineTokenBucket, type TokenBucket } from "./rate-limit.ts";
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

/** Per-peer rate-limit configuration. Each value is messages-per-second; `undefined` disables that limiter. */
export interface RateLimitOptions {
  /** Cap on `chat` messages per peer per second. */
  chatPerSec?: number;
  /** Cap on `presence-update` messages per peer per second. */
  presenceUpdatesPerSec?: number;
}

/** Session constructor options. */
export interface SessionOptions {
  /** Maximum simultaneous peers per room. Defaults to {@link DEFAULT_MAX_PEERS_PER_ROOM}. */
  maxPeersPerRoom?: number;
  /** Pluggable auth check called when a peer attempts a join. Default: allow all. */
  authenticate?: AuthenticateFn;
  /**
   * Per-peer rate limits on inbound `chat` and `presence-update` messages.
   * Over-budget messages reject with {@link SignalingRateLimitError} and are
   * NOT relayed. Disabled by default — `rateLimit` undefined or both fields
   * `undefined` means no throttling.
   */
  rateLimit?: RateLimitOptions;
  /**
   * Cap on the per-room chat-history ring buffer. `0` (default) disables.
   * Joiners that set `replayHistory: true` on their `join` receive a
   * `chat-history` message right after `presence-snapshot` containing the
   * last N chats.
   */
  chatHistoryPerRoom?: number;
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
  private readonly rateLimit: RateLimitOptions | undefined;
  private readonly chatHistoryPerRoom: number;
  private readonly sockets = new Map<SocketId, SocketRecord>();
  private readonly roomMap = new Map<RoomId, Room>();
  /** Cross-room peer index: peerId → socket record. Maintained by applyJoin/Leave/Disconnect. */
  private readonly peerIndex = new Map<PeerId, SocketRecord>();
  /** Per-peer rate-limit token buckets. Lazily created on first applicable inbound. */
  private readonly buckets = new Map<PeerId, { chat?: TokenBucket; presence?: TokenBucket }>();
  private sendHandler: SendHandler | undefined;

  constructor(opts: SessionOptions = {}) {
    this.maxPeersPerRoom = opts.maxPeersPerRoom ?? DEFAULT_MAX_PEERS_PER_ROOM;
    this.authenticate = opts.authenticate;
    this.rateLimit = opts.rateLimit;
    this.chatHistoryPerRoom = opts.chatHistoryPerRoom ?? 0;
  }

  /** Lazily build (or fetch) the per-peer rate-limit buckets. */
  private bucketsFor(peerId: PeerId): { chat?: TokenBucket; presence?: TokenBucket } {
    let entry = this.buckets.get(peerId);
    if (entry === undefined) {
      entry = {};
      if (this.rateLimit?.chatPerSec !== undefined && this.rateLimit.chatPerSec > 0) {
        entry.chat = defineTokenBucket({
          capacity: this.rateLimit.chatPerSec,
          refillPerSec: this.rateLimit.chatPerSec,
        });
      }
      if (
        this.rateLimit?.presenceUpdatesPerSec !== undefined &&
        this.rateLimit.presenceUpdatesPerSec > 0
      ) {
        entry.presence = defineTokenBucket({
          capacity: this.rateLimit.presenceUpdatesPerSec,
          refillPerSec: this.rateLimit.presenceUpdatesPerSec,
        });
      }
      this.buckets.set(peerId, entry);
    }
    return entry;
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
      case "leave":
        this.applyLeave(socket, message);
        return;
      case "sdp":
        this.applySdp(message);
        return;
      case "ice":
        this.applyIce(message);
        return;
      case "presence-update":
        this.applyPresenceUpdate(socket, message);
        return;
      case "chat":
        this.applyChat(socket, message);
        return;
      default:
        // Other message types added in later tasks.
        throw new SignalingValidationError(`unsupported message type ${message.type}`, {
          context: { socketId, type: message.type },
        });
    }
  }

  /**
   * Notify the engine that a transport-level connection has closed. Cleans
   * up the socket's room/peer binding and broadcasts `peer-left` to the
   * remaining members of any room the socket was in. No-op for unknown
   * sockets, so hosts can call it from a `finally` block without try/catch.
   */
  async handleDisconnect(socketId: SocketId): Promise<void> {
    const socket = this.sockets.get(socketId);
    if (socket === undefined) return;

    if (socket.roomId !== undefined && socket.peerId !== undefined) {
      const room = this.roomMap.get(socket.roomId);
      if (room !== undefined) {
        room.remove(socket.peerId);
        const hadPresence = room.clearPresence(socket.peerId);
        for (const remaining of room.peers()) {
          this.send(remaining.peerId, { type: "peer-left", peer: socket.peerId });
          if (hadPresence) {
            this.send(remaining.peerId, {
              type: "presence-state",
              peer: socket.peerId,
              attributes: {},
            });
          }
        }
        if (room.size === 0) {
          this.roomMap.delete(room.id);
        }
      }
      this.peerIndex.delete(socket.peerId);
      this.buckets.delete(socket.peerId);
    }

    this.sockets.delete(socketId);
  }

  /**
   * Internal: registers the peer in the room and broadcasts `peer-joined`
   * notifications both ways (to existing peers about the joiner, and to the
   * joiner about each existing peer). Calls the optional `authenticate`
   * callback first; rejection short-circuits with {@link SignalingAuthError}
   * before any state is mutated. Capacity enforcement is delegated to
   * {@link Room.add} which throws {@link RoomFullError}.
   */
  private async applyJoin(
    socket: SocketRecord,
    message: Extract<SignalingMessageType, { type: "join" }>,
  ): Promise<void> {
    if (this.authenticate !== undefined) {
      const ok = await this.authenticate(socket.token, message.room);
      if (!ok) {
        throw new SignalingAuthError("authentication rejected", {
          context: { socketId: socket.socketId, room: message.room, peer: message.peer },
        });
      }
    }

    const room = this.getOrCreateRoom(message.room);
    const existingPeers = room.peers();

    socket.peerId = message.peer;
    socket.roomId = message.room;
    room.add({ peerId: message.peer, socketId: socket.socketId, role: message.role });
    this.peerIndex.set(message.peer, socket);

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
    // Send the joiner the room's current presence snapshot. Always sent —
    // even when empty — so clients can rely on a single arrival to know
    // their initial view of the room is settled.
    this.send(message.peer, {
      type: "presence-snapshot",
      room: message.room,
      peers: room.presenceSnapshot(),
    });
  }

  /**
   * Internal: removes the peer from the room and broadcasts `peer-left` to
   * remaining members. Idempotent — leaving a non-existent room or removing
   * a peer that isn't in the room is a no-op (no error, no broadcast).
   * Garbage-collects empty rooms so the room map doesn't grow unbounded.
   */
  private applyLeave(
    socket: SocketRecord,
    message: Extract<SignalingMessageType, { type: "leave" }>,
  ): void {
    const room = this.roomMap.get(message.room);
    if (room === undefined) return;
    const removed = room.remove(message.peer);
    if (removed === undefined) return;
    this.peerIndex.delete(message.peer);

    const hadPresence = room.clearPresence(message.peer);

    // Clear socket's peer/room association if the leaving peer matches.
    if (socket.peerId === message.peer && socket.roomId === message.room) {
      delete socket.peerId;
      delete socket.roomId;
    }

    for (const remaining of room.peers()) {
      this.send(remaining.peerId, { type: "peer-left", peer: message.peer });
      if (hadPresence) {
        // Empty attributes signal "drop this peer's presence entry."
        this.send(remaining.peerId, {
          type: "presence-state",
          peer: message.peer,
          attributes: {},
        });
      }
    }

    if (room.size === 0) {
      this.roomMap.delete(room.id);
    }
  }

  /**
   * Internal: routes an SDP offer/answer to the target peer. The server
   * does not parse the SDP body — codec selection, simulcast, header
   * extensions, etc. are negotiated end-to-end. Throws
   * {@link PeerNotFoundError} if the target peer is not registered.
   */
  private applySdp(message: Extract<SignalingMessageType, { type: "sdp" }>): void {
    if (!this.peerIndex.has(message.to)) {
      throw new PeerNotFoundError(`unknown peer ${message.to}`, {
        context: { peer: message.to, from: message.from },
      });
    }
    this.send(message.to, message);
  }

  /**
   * Internal: routes an ICE candidate (or `null` end-of-candidates marker)
   * to the target peer. Same opaque-payload policy as SDP — the candidate
   * shape varies across browsers and is forwarded untouched. Throws
   * {@link PeerNotFoundError} if the target peer is not registered.
   */
  private applyIce(message: Extract<SignalingMessageType, { type: "ice" }>): void {
    if (!this.peerIndex.has(message.to)) {
      throw new PeerNotFoundError(`unknown peer ${message.to}`, {
        context: { peer: message.to, from: message.from },
      });
    }
    this.send(message.to, message);
  }

  /**
   * Internal: merge an inbound `presence-update` into the peer's room
   * presence map and broadcast a `presence-state` to every member of the
   * room (including the sender — confirms the merge applied). Rejects when
   * the sender is not currently bound to a room or the `peer` claim does
   * not match its socket binding.
   */
  private applyPresenceUpdate(
    socket: SocketRecord,
    message: Extract<SignalingMessageType, { type: "presence-update" }>,
  ): void {
    if (socket.peerId !== message.peer || socket.roomId === undefined) {
      throw new SignalingValidationError(
        "presence-update requires a joined socket bound to the same peer",
        { context: { socketId: socket.socketId, claimed: message.peer, bound: socket.peerId } },
      );
    }
    const bucket = this.bucketsFor(socket.peerId).presence;
    if (bucket !== undefined && !bucket.consume()) {
      throw new SignalingRateLimitError("presence-update rate limit exceeded", {
        context: { socketId: socket.socketId, peer: socket.peerId },
      });
    }
    const room = this.roomMap.get(socket.roomId);
    if (room === undefined) return;
    room.setPresence(message.peer, message.attributes);
    const next = room.getPresence(message.peer) ?? {};
    for (const member of room.peers()) {
      this.send(member.peerId, {
        type: "presence-state",
        peer: message.peer,
        attributes: next,
      });
    }
  }

  /**
   * Internal: route a `chat` message. With `to` set, deliver only to that
   * peer (silently drops if they're not in the same room). Without `to`,
   * broadcast to all room members except the sender. The server validates
   * `from` matches the socket binding before relaying.
   */
  private applyChat(
    socket: SocketRecord,
    message: Extract<SignalingMessageType, { type: "chat" }>,
  ): void {
    if (socket.peerId !== message.from || socket.roomId === undefined) {
      throw new SignalingValidationError("chat requires a joined socket bound to the same peer", {
        context: { socketId: socket.socketId, claimed: message.from, bound: socket.peerId },
      });
    }
    const bucket = this.bucketsFor(socket.peerId).chat;
    if (bucket !== undefined && !bucket.consume()) {
      throw new SignalingRateLimitError("chat rate limit exceeded", {
        context: { socketId: socket.socketId, peer: socket.peerId },
      });
    }
    const room = this.roomMap.get(socket.roomId);
    if (room === undefined) return;

    const echoToSender = message.clientId !== undefined;

    if (message.to !== undefined) {
      if (room.has(message.to)) {
        this.send(message.to, message);
      }
      if (echoToSender && message.to !== message.from) {
        this.send(message.from, message);
      }
      return;
    }
    for (const member of room.peers()) {
      if (member.peerId !== message.from || echoToSender) {
        this.send(member.peerId, message);
      }
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
