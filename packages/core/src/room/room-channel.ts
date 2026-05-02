/**
 * `RoomChannel` — room-level presence + chat layer.
 *
 * Wraps a {@link SignalingTransport} and a target room with two responsibilities:
 *
 * 1. **Presence** — sticky per-peer attributes (raise-hand, status emoji, mute
 *    state, etc.) backed by the engine's per-room presence map. Set/remove
 *    own attributes with `setAttribute(k, v)` / `removeAttribute(k)`; observe
 *    the live snapshot via `peers` or the `presence` / `presence-snapshot`
 *    events.
 *
 * 2. **Chat** — broadcast (room-wide) or DM (`{ to }`) text messages with an
 *    in-memory rolling history (capped at `chatHistoryLimit`).
 *
 * The channel does **not** own its transport's lifecycle — `start()` only
 * subscribes to inbound messages and (by default) issues a join with role
 * `"presence"`. Pass `manageJoin: false` to share a transport with a
 * Publisher/Viewer that already manages the join.
 *
 * Prefer {@link defineRoomChannel} as the call style; the class is exported
 * for type imports and `instanceof` checks.
 */

import { defineEmitter, type Emitter } from "@/events/emitter.ts";
import type {
  ChatMessage,
  JsonValue,
  PresenceSnapshotMessage,
  PresenceStateMessage,
  SignalingMessageType,
} from "@forinda/video-sdk-signaling-protocol";
import type { ChatHistoryEntry, RoomChannelEvents, RoomChannelOptions } from "./types.ts";

const DEFAULT_CHAT_HISTORY_LIMIT = 200;

export class RoomChannel {
  readonly room: string;
  readonly peerId: string;
  private readonly signaling: RoomChannelOptions["signaling"];
  private readonly manageJoin: boolean;
  private readonly chatHistoryLimit: number;
  private readonly emitter: Emitter<RoomChannelEvents> = defineEmitter();
  private readonly disposers: Array<() => void> = [];
  /** Live presence map keyed by peerId. */
  private readonly presenceMap = new Map<string, Record<string, JsonValue>>();
  private readonly chatBuffer: ChatHistoryEntry[] = [];
  private readonly ownAttributeKeys = new Set<string>();
  private started = false;
  private stopped = false;

  constructor(opts: RoomChannelOptions) {
    this.signaling = opts.signaling;
    this.room = opts.room;
    this.peerId =
      opts.peerId ?? (typeof crypto !== "undefined" ? crypto.randomUUID() : `peer-${Date.now()}`);
    this.manageJoin = opts.manageJoin ?? true;
    this.chatHistoryLimit = opts.chatHistoryLimit ?? DEFAULT_CHAT_HISTORY_LIMIT;
  }

  /** Read-only view of the room's current presence map. */
  get peers(): ReadonlyMap<string, Readonly<Record<string, JsonValue>>> {
    return this.presenceMap;
  }

  /** Read-only view of the chat history (oldest first, capped at the limit). */
  get chatHistory(): readonly ChatHistoryEntry[] {
    return this.chatBuffer;
  }

  /** Subscribe to a typed channel event. Returns an unsubscribe function. */
  on<E extends keyof RoomChannelEvents>(
    event: E,
    handler: (payload: RoomChannelEvents[E]) => void,
  ): () => void {
    return this.emitter.on(event, handler);
  }

  /**
   * Subscribe to inbound signaling and (when `manageJoin: true`) issue the
   * `join` so the engine's presence + chat handlers see this peer.
   */
  async start(): Promise<void> {
    if (this.started) return;
    if (this.stopped) {
      throw new Error("RoomChannel has been stopped; create a new instance to reuse");
    }
    this.started = true;

    this.disposers.push(this.signaling.on("message", (msg) => this.routeMessage(msg)));

    if (this.manageJoin) {
      // The transport may already be connected when shared with a Publisher/
      // Viewer; calling connect on an idempotent transport is safe and lets
      // the channel work standalone too.
      await this.signaling.connect();
      await this.signaling.send({
        type: "join",
        room: this.room,
        peer: this.peerId,
        role: "presence",
      });
    }
  }

  /**
   * Stop processing inbound messages and (when `manageJoin: true`) issue a
   * `leave`. Idempotent.
   */
  async stop(): Promise<void> {
    if (!this.started || this.stopped) return;
    this.stopped = true;

    for (const dispose of this.disposers) dispose();
    this.disposers.length = 0;

    if (this.manageJoin) {
      try {
        await this.signaling.send({
          type: "leave",
          room: this.room,
          peer: this.peerId,
        });
      } catch {
        // Transport may already be closed; nothing useful to do.
      }
    }
  }

  /** Set or replace a single own presence attribute. */
  async setAttribute(key: string, value: JsonValue): Promise<void> {
    this.ownAttributeKeys.add(key);
    await this.signaling.send({
      type: "presence-update",
      peer: this.peerId,
      attributes: { [key]: value },
    });
  }

  /**
   * Remove a single own presence attribute. Sends `null` over the wire which
   * the engine treats as the delete sentinel.
   */
  async removeAttribute(key: string): Promise<void> {
    this.ownAttributeKeys.delete(key);
    await this.signaling.send({
      type: "presence-update",
      peer: this.peerId,
      attributes: { [key]: null },
    });
  }

  /** Remove every attribute this channel has previously set. */
  async clearAttributes(): Promise<void> {
    if (this.ownAttributeKeys.size === 0) return;
    const attributes: Record<string, JsonValue> = {};
    for (const k of this.ownAttributeKeys) attributes[k] = null;
    this.ownAttributeKeys.clear();
    await this.signaling.send({
      type: "presence-update",
      peer: this.peerId,
      attributes,
    });
  }

  /** Sugar for `setAttribute("hand-raised", true)`. */
  async raiseHand(): Promise<void> {
    await this.setAttribute("hand-raised", true);
  }

  /** Sugar for `removeAttribute("hand-raised")`. */
  async lowerHand(): Promise<void> {
    await this.removeAttribute("hand-raised");
  }

  /**
   * Send a chat message. Omit `to` to broadcast to the whole room; pass a
   * peerId to deliver as a DM.
   */
  async sendChat(body: string, opts: { to?: string } = {}): Promise<void> {
    const msg: ChatMessage = {
      type: "chat",
      from: this.peerId,
      body,
      ts: Date.now(),
      ...(opts.to !== undefined ? { to: opts.to } : {}),
    };
    await this.signaling.send(msg);
  }

  private routeMessage(message: SignalingMessageType): void {
    switch (message.type) {
      case "presence-snapshot":
        this.applyPresenceSnapshot(message);
        return;
      case "presence-state":
        this.applyPresenceState(message);
        return;
      case "peer-joined":
        this.emitter.emit("peer-joined", { peer: message.peer, role: message.role });
        return;
      case "peer-left":
        this.presenceMap.delete(message.peer);
        this.emitter.emit("peer-left", { peer: message.peer });
        return;
      case "chat":
        this.applyChat(message);
        return;
      default:
        // Ignore SDP / ICE / join — those belong to Publisher / Viewer.
        return;
    }
  }

  private applyPresenceSnapshot(message: PresenceSnapshotMessage): void {
    if (message.room !== this.room) return;
    this.presenceMap.clear();
    for (const [peer, attrs] of Object.entries(message.peers)) {
      this.presenceMap.set(peer, attrs);
    }
    this.emitter.emit("presence-snapshot", message.peers);
  }

  private applyPresenceState(message: PresenceStateMessage): void {
    if (Object.keys(message.attributes).length === 0) {
      this.presenceMap.delete(message.peer);
    } else {
      this.presenceMap.set(message.peer, message.attributes);
    }
    this.emitter.emit("presence", { peer: message.peer, attributes: message.attributes });
  }

  private applyChat(message: ChatMessage): void {
    const entry: ChatHistoryEntry = { ...message, receivedAt: Date.now() };
    this.chatBuffer.push(entry);
    while (this.chatBuffer.length > this.chatHistoryLimit) {
      this.chatBuffer.shift();
    }
    this.emitter.emit("chat", entry);
  }
}

/**
 * Declarative factory for {@link RoomChannel}. Recommended call style.
 *
 * ```ts
 * const channel = defineRoomChannel({ signaling, room: "demo", peerId: "alice" });
 * await channel.start();
 * await channel.raiseHand();
 * channel.on("chat", (m) => console.log(m.from, m.body));
 * ```
 */
export function defineRoomChannel(opts: RoomChannelOptions): RoomChannel {
  return new RoomChannel(opts);
}
