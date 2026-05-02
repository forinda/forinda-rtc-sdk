/**
 * `Room` — a single room's peer registry.
 *
 * This is a **pure data structure**: no events, no broadcasting, no async.
 * Rooms own only the membership map; broadcasting `peer-joined`/`peer-left`
 * to other peers is the {@link "./session.ts".Session}'s job (the Session
 * owns the {@link "./types.ts".SendHandler}, Rooms do not).
 *
 * Why split rooms out of session:
 * - Capacity enforcement (`isFull`, `add` throwing `RoomFullError`) is local
 *   to one room and easier to test in isolation.
 * - Removing a peer by id vs by socketId is room-local; Sessions delegate.
 * - When future epics introduce richer room state (moderators, recording
 *   targets, etc.), it lives here without bloating Session.
 *
 * Invariants:
 * - `peerMap` is keyed by `peerId`; rejoining the same peerId replaces the
 *   prior entry (covers the "same identity, new socket" reconnect case).
 * - `peers()` returns a fresh array snapshot — callers can iterate without
 *   worrying about concurrent mutation.
 * - Capacity check only fires for *new* peer ids; an existing peer rejoining
 *   never triggers `RoomFullError`.
 */

import { RoomFullError } from "./errors.ts";
import type { JsonValue } from "./messages.ts";
import type { PeerId, RoomId, RoomPeer, SocketId } from "./types.ts";

/** Constructor options for a {@link Room}. */
export interface RoomOptions {
  /** Maximum simultaneous peers. New joiners past this throw {@link RoomFullError}. */
  capacity: number;
  /**
   * Cap on the per-room chat-history ring buffer. `0` (default) disables
   * the buffer entirely — `pushChat` becomes a no-op and `chatHistory`
   * always returns `[]`. The Session opts joiners into receiving the
   * history via `replayHistory: true` on their `join`.
   */
  chatHistoryLimit?: number;
}

/**
 * In-memory peer registry for one room. Lives inside a {@link "./session.ts".Session};
 * never instantiated directly by package consumers.
 */
export class Room {
  readonly id: RoomId;
  private readonly capacity: number;
  private readonly peerMap = new Map<PeerId, RoomPeer>();
  /** Per-peer presence attributes; empty entries are removed from the map. */
  private readonly presenceMap = new Map<PeerId, Record<string, JsonValue>>();
  private readonly chatBuffer: import("./messages.ts").ChatMessage[] = [];
  private readonly chatHistoryLimit: number;

  constructor(id: RoomId, opts: RoomOptions) {
    this.id = id;
    this.capacity = opts.capacity;
    this.chatHistoryLimit = opts.chatHistoryLimit ?? 0;
  }

  /** Current number of peers in the room. */
  get size(): number {
    return this.peerMap.size;
  }

  /** True when adding a *new* peer would exceed capacity. */
  isFull(): boolean {
    return this.peerMap.size >= this.capacity;
  }

  /** True when a peer with `peerId` is currently in the room. */
  has(peerId: PeerId): boolean {
    return this.peerMap.has(peerId);
  }

  /** Returns the peer record, or `undefined` if absent. */
  get(peerId: PeerId): RoomPeer | undefined {
    return this.peerMap.get(peerId);
  }

  /** Snapshot of all peers. Mutating the returned array does not affect the room. */
  peers(): readonly RoomPeer[] {
    return [...this.peerMap.values()];
  }

  /**
   * Adds or replaces a peer. Throws {@link RoomFullError} only when adding a
   * brand-new peerId would exceed `capacity`; a rejoin (same peerId) is always
   * allowed and silently replaces the prior entry.
   */
  add(peer: RoomPeer): void {
    if (!this.peerMap.has(peer.peerId) && this.peerMap.size >= this.capacity) {
      throw new RoomFullError(`room ${this.id} is full (capacity ${this.capacity})`, {
        context: { room: this.id, capacity: this.capacity },
      });
    }
    this.peerMap.set(peer.peerId, peer);
  }

  /** Removes by peerId. Returns the removed peer or `undefined` if absent. */
  remove(peerId: PeerId): RoomPeer | undefined {
    const existing = this.peerMap.get(peerId);
    if (existing === undefined) return undefined;
    this.peerMap.delete(peerId);
    return existing;
  }

  /**
   * Removes by socketId (linear scan). Used by {@link "./session.ts".Session.handleDisconnect}
   * when a transport closes and the engine needs to find which peer that
   * socket belonged to.
   */
  removeBySocket(socketId: SocketId): RoomPeer | undefined {
    for (const peer of this.peerMap.values()) {
      if (peer.socketId === socketId) {
        this.peerMap.delete(peer.peerId);
        return peer;
      }
    }
    return undefined;
  }

  /**
   * Merge `attributes` into a peer's presence map. `null` values delete the
   * key (this is how clients signal "remove this attribute" over the wire,
   * since `undefined` doesn't survive JSON). When the resulting map is empty
   * the peer's entry is dropped from the presence index entirely.
   */
  setPresence(peerId: PeerId, attributes: Record<string, JsonValue>): void {
    const existing = this.presenceMap.get(peerId) ?? {};
    const next: Record<string, JsonValue> = { ...existing };
    for (const [k, v] of Object.entries(attributes)) {
      if (v === null) delete next[k];
      else next[k] = v;
    }
    if (Object.keys(next).length === 0) {
      this.presenceMap.delete(peerId);
    } else {
      this.presenceMap.set(peerId, next);
    }
  }

  /** Returns the live attribute map for `peerId`, or `undefined` when none. */
  getPresence(peerId: PeerId): Record<string, JsonValue> | undefined {
    return this.presenceMap.get(peerId);
  }

  /**
   * Snapshot of every peer's presence attributes in this room. Returns a
   * fresh plain object suitable for sending over the wire as a
   * `presence-snapshot`.
   */
  presenceSnapshot(): Record<PeerId, Record<string, JsonValue>> {
    return Object.fromEntries(this.presenceMap);
  }

  /** Drops a peer's presence entry. Returns true when something was removed. */
  clearPresence(peerId: PeerId): boolean {
    return this.presenceMap.delete(peerId);
  }

  /**
   * Append a successfully-applied chat to the per-room ring buffer. No-op
   * when `chatHistoryLimit` is `0`. Old entries are dropped from the front
   * once the limit is reached.
   */
  pushChat(msg: import("./messages.ts").ChatMessage): void {
    if (this.chatHistoryLimit === 0) return;
    this.chatBuffer.push(msg);
    while (this.chatBuffer.length > this.chatHistoryLimit) {
      this.chatBuffer.shift();
    }
  }

  /** Read-only snapshot of the chat history (oldest first). */
  chatHistory(): readonly import("./messages.ts").ChatMessage[] {
    return this.chatBuffer;
  }
}

/**
 * Declarative factory for {@link Room}. Prefer this over `new Room(...)` even
 * inside the package — keeps construction style uniform with the rest of the
 * SDK (`defineSession`, `defineSignalingEngine`, etc.).
 *
 * ```ts
 * const room = defineRoom({ id: "demo", capacity: 50 });
 * ```
 */
export function defineRoom(opts: { id: RoomId } & RoomOptions): Room {
  const { id, ...roomOpts } = opts;
  return new Room(id, roomOpts);
}
