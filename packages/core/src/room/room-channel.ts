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
import { SdkError } from "@/errors/errors.ts";
import { defineRetryPolicy, RetryPolicy } from "@/retry/policy.ts";
import type { TransportState } from "@/signaling/transport.ts";
import type {
  ChatMessage,
  JsonValue,
  PresenceSnapshotMessage,
  PresenceStateMessage,
  SignalingMessageType,
} from "@forinda/video-sdk-signaling-protocol";
import type {
  ChatHistoryEntry,
  RoomChannelEvents,
  RoomChannelOptions,
  RoomChannelState,
} from "./types.ts";

const DEFAULT_CHAT_HISTORY_LIMIT = 200;
const DEFAULT_CHAT_ACK_TIMEOUT_MS = 10_000;

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
  /** Outgoing chats awaiting server echo. Keyed by clientId. */
  private readonly pendingChats = new Map<string, ChatHistoryEntry>();
  private readonly chatAckTimeoutMs: number;
  /** Per-pending-chat timers; cleared on echo or fail. */
  private readonly chatAckTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly ownAttributeKeys = new Set<string>();
  private readonly leader: RoomChannelOptions["__leader"];
  private readonly retryPolicy: RetryPolicy;
  private retryTimer: ReturnType<typeof setTimeout> | undefined;
  private _state: RoomChannelState = "idle";

  constructor(opts: RoomChannelOptions) {
    this.leader = opts.__leader;
    this.signaling = opts.__leader?.signaling ?? opts.signaling;
    this.room = opts.__leader?.room ?? opts.room;
    this.peerId =
      opts.__leader?.peerId ??
      opts.peerId ??
      (typeof crypto !== "undefined" ? crypto.randomUUID() : `peer-${Date.now()}`);
    // When attached to a Room, the leader owns join/leave; this channel is
    // pure presence + chat. `manageJoin` becomes implicit-false.
    this.manageJoin = opts.__leader ? false : (opts.manageJoin ?? true);
    this.chatHistoryLimit = opts.chatHistoryLimit ?? DEFAULT_CHAT_HISTORY_LIMIT;
    this.chatAckTimeoutMs = opts.chatAckTimeoutMs ?? DEFAULT_CHAT_ACK_TIMEOUT_MS;
    this.retryPolicy = defineRetryPolicy(opts.retry ?? {});
  }

  /** Channel-level lifecycle state. Mirrors the `state` event. */
  get state(): RoomChannelState {
    return this._state;
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
    if (this._state !== "idle") {
      if (this._state === "closed") {
        throw new Error("RoomChannel has been stopped; create a new instance to reuse");
      }
      return;
    }
    this.setState("connecting");

    this.disposers.push(this.signaling.on("message", (msg) => this.routeMessage(msg)));
    this.disposers.push(
      this.signaling.on("state", (s: TransportState) => {
        // Once the transport drops post-`connected`, drive the recovery loop.
        // Skip while already retrying — handleSessionFailure handles the
        // chained drops itself.
        if (s === "closed" && this._state === "connected") {
          this.handleSessionFailure(
            new SdkError("signaling closed unexpectedly", { code: "signaling_closed" }),
          );
        }
      }),
    );

    if (this.leader) {
      // Attached: defer transport + join entirely to the Room. Whatever role
      // the Room joined as is fine — presence/chat work for any role.
      await this.leader.ensureConnected();
      // The Room's own start() will have joined; if not, default to presence
      // (a chat-only joiner against a publisher Room is fine).
      if (this.leader.role === null) {
        await this.leader.ensureJoined("presence");
      }
    } else if (this.manageJoin) {
      // Standalone path. Only open the transport when not already in flight.
      if (this.signaling.state !== "connected" && this.signaling.state !== "connecting") {
        await this.signaling.connect();
      }
      await this.signaling.send({
        type: "join",
        room: this.room,
        peer: this.peerId,
        role: "presence",
      });
    }

    this.setState("connected");
  }

  /**
   * Stop processing inbound messages and (when `manageJoin: true`) issue a
   * `leave`. Idempotent.
   */
  async stop(): Promise<void> {
    if (this._state === "closed" || this._state === "idle") return;

    for (const dispose of this.disposers) dispose();
    this.disposers.length = 0;

    for (const timer of this.chatAckTimers.values()) clearTimeout(timer);
    this.chatAckTimers.clear();

    if (this.retryTimer !== undefined) {
      clearTimeout(this.retryTimer);
      this.retryTimer = undefined;
    }

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

    this.setState("closed");
  }

  private setState(next: RoomChannelState): void {
    if (this._state === next) return;
    this._state = next;
    this.emitter.emit("state", next);
  }

  /**
   * Internal: handle a transport-level failure after the channel was
   * already `connected`. Marks every in-flight pending chat as failed
   * (we don't know if they reached the engine before the drop), then
   * schedules a reconnect attempt or transitions to `closed` on
   * exhaustion.
   */
  private handleSessionFailure(cause: SdkError): void {
    if (this._state === "closed") return;

    for (const id of [...this.pendingChats.keys()]) {
      this.markChatFailed(id);
    }

    this.setState("reconnecting");

    const delay = this.retryPolicy.nextDelayMs();
    if (delay === null) {
      this.emitter.emit(
        "error",
        new SdkError("retry budget exhausted", { code: "retry_exhausted", cause }),
      );
      this.setState("closed");
      return;
    }

    this.retryTimer = setTimeout(() => {
      void this.attemptReconnect();
    }, delay);
  }

  private async attemptReconnect(): Promise<void> {
    if (this._state === "closed") return;
    this.retryTimer = undefined;
    try {
      await this.signaling.connect();
      if (this.manageJoin) {
        await this.signaling.send({
          type: "join",
          room: this.room,
          peer: this.peerId,
          role: "presence",
        });
      }
      await this.resyncPresence();
      this.setState("connected");
      this.retryPolicy.markSuccess();
    } catch (cause) {
      this.handleSessionFailure(
        new SdkError("reconnect attempt failed", {
          code: "reconnect_failed",
          cause,
        }),
      );
    }
  }

  /**
   * Re-broadcast every previously-set own presence attribute so other peers
   * see the right state after the reconnect. Reads the current values from
   * the local presence map (the engine sent us a `presence-state` for
   * each `setAttribute`, which we mirrored).
   */
  private async resyncPresence(): Promise<void> {
    if (this.ownAttributeKeys.size === 0) return;
    const attributes: Record<string, JsonValue> = {};
    for (const k of this.ownAttributeKeys) {
      const current = this.presenceMap.get(this.peerId)?.[k];
      if (current !== undefined) attributes[k] = current;
    }
    if (Object.keys(attributes).length === 0) return;
    await this.signaling.send({
      type: "presence-update",
      peer: this.peerId,
      attributes,
    });
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
   * Send a chat message. Synchronously appends a `pending` entry to the
   * local history and emits `chat` + `chat-status: pending`. Resolves with
   * the entry's `id`. The server echoes the message back; on receipt the
   * matching pending entry flips to `confirmed` and a second `chat-status`
   * fires. If `signaling.send` rejects, the entry flips to `failed` before
   * the rejection propagates.
   */
  async sendChat(body: string, opts: { to?: string } = {}): Promise<string> {
    const id = this.generateChatId();
    const ts = Date.now();
    const msg: ChatMessage = {
      type: "chat",
      from: this.peerId,
      body,
      ts,
      clientId: id,
      ...(opts.to !== undefined ? { to: opts.to } : {}),
    };
    const entry: ChatHistoryEntry = {
      ...msg,
      receivedAt: ts,
      id,
      status: "pending",
    };
    this.chatBuffer.push(entry);
    while (this.chatBuffer.length > this.chatHistoryLimit) {
      this.chatBuffer.shift();
    }
    this.pendingChats.set(id, entry);
    this.emitter.emit("chat", entry);
    this.emitter.emit("chat-status", { id, status: "pending" });

    const timer = setTimeout(() => {
      this.markChatFailed(id);
    }, this.chatAckTimeoutMs);
    this.chatAckTimers.set(id, timer);

    try {
      await this.signaling.send(msg);
    } catch (cause) {
      this.markChatFailed(id);
      throw cause;
    }
    return id;
  }

  /** Internal: mark a pending chat as failed (timeout, send error, drop). */
  private markChatFailed(id: string): void {
    const timer = this.chatAckTimers.get(id);
    if (timer !== undefined) {
      clearTimeout(timer);
      this.chatAckTimers.delete(id);
    }
    const entry = this.pendingChats.get(id);
    if (!entry || entry.status !== "pending") return;
    entry.status = "failed";
    this.pendingChats.delete(id);
    this.emitter.emit("chat-status", { id, status: "failed" });
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
    // Self-echo of an optimistic send → reconcile the existing pending entry
    // instead of pushing a duplicate.
    if (
      message.from === this.peerId &&
      message.clientId !== undefined &&
      this.pendingChats.has(message.clientId)
    ) {
      const id = message.clientId;
      const entry = this.pendingChats.get(id);
      if (entry && entry.status === "pending") {
        const timer = this.chatAckTimers.get(id);
        if (timer !== undefined) {
          clearTimeout(timer);
          this.chatAckTimers.delete(id);
        }
        entry.status = "confirmed";
        this.pendingChats.delete(id);
        this.emitter.emit("chat-status", { id, status: "confirmed" });
      }
      return;
    }
    const id = message.clientId ?? this.generateChatId();
    const entry: ChatHistoryEntry = {
      ...message,
      receivedAt: Date.now(),
      id,
      status: "confirmed",
    };
    this.chatBuffer.push(entry);
    while (this.chatBuffer.length > this.chatHistoryLimit) {
      this.chatBuffer.shift();
    }
    this.emitter.emit("chat", entry);
  }

  private generateChatId(): string {
    return typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `chat-${Date.now()}-${Math.random().toString(36).slice(2)}`;
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

/**
 * Proxy factory for the **attached** case — wires a RoomChannel to share a
 * {@link "./room.ts".Room}'s transport + single-`join` coordination. The
 * channel becomes a pure presence + chat overlay; the Room owns the join.
 *
 * Equivalent to `room.channel(opts)`.
 */
export function defineAttachedRoomChannel(
  leader: import("./types.ts").RoomLeader,
  opts: import("./types.ts").AttachedRoomChannelOptions = {},
): RoomChannel {
  return new RoomChannel({
    __leader: leader,
    signaling: leader.signaling,
    room: leader.room,
    peerId: leader.peerId,
    ...opts,
  });
}
