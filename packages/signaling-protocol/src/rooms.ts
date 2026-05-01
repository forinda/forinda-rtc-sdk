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
import type { PeerId, RoomId, RoomPeer, SocketId } from "./types.ts";

/** Constructor options for a {@link Room}. */
export interface RoomOptions {
  /** Maximum simultaneous peers. New joiners past this throw {@link RoomFullError}. */
  capacity: number;
}

/**
 * In-memory peer registry for one room. Lives inside a {@link "./session.ts".Session};
 * never instantiated directly by package consumers.
 */
export class Room {
  readonly id: RoomId;
  private readonly capacity: number;
  private readonly peerMap = new Map<PeerId, RoomPeer>();

  constructor(id: RoomId, opts: RoomOptions) {
    this.id = id;
    this.capacity = opts.capacity;
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
}
