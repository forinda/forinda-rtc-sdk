import { RoomFullError } from "./errors.ts";
import type { PeerId, RoomId, RoomPeer, SocketId } from "./types.ts";

export interface RoomOptions {
  capacity: number;
}

export class Room {
  readonly id: RoomId;
  private readonly capacity: number;
  private readonly peerMap = new Map<PeerId, RoomPeer>();

  constructor(id: RoomId, opts: RoomOptions) {
    this.id = id;
    this.capacity = opts.capacity;
  }

  get size(): number {
    return this.peerMap.size;
  }

  isFull(): boolean {
    return this.peerMap.size >= this.capacity;
  }

  has(peerId: PeerId): boolean {
    return this.peerMap.has(peerId);
  }

  get(peerId: PeerId): RoomPeer | undefined {
    return this.peerMap.get(peerId);
  }

  peers(): readonly RoomPeer[] {
    return [...this.peerMap.values()];
  }

  add(peer: RoomPeer): void {
    if (!this.peerMap.has(peer.peerId) && this.peerMap.size >= this.capacity) {
      throw new RoomFullError(`room ${this.id} is full (capacity ${this.capacity})`, {
        context: { room: this.id, capacity: this.capacity },
      });
    }
    this.peerMap.set(peer.peerId, peer);
  }

  remove(peerId: PeerId): RoomPeer | undefined {
    const existing = this.peerMap.get(peerId);
    if (existing === undefined) return undefined;
    this.peerMap.delete(peerId);
    return existing;
  }

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
