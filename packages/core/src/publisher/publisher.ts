/**
 * `Publisher` — the consumer-facing orchestrator for one-to-many video
 * publishing.
 *
 * Wraps the EPIC-3a primitives (`PeerConnection`, `Negotiator`,
 * `StatsCollector`) plus a `SignalingTransport`. Manages one
 * `RTCPeerConnection` per connected viewer; the publisher is the impolite
 * peer in perfect-negotiation collisions.
 *
 * EPIC-3b Task 4 ships the skeleton: signaling join, state machine, stop.
 * Subsequent tasks layer in viewer handling, SDP/ICE routing, stats, hot-
 * swap, and retry.
 *
 * Prefer {@link definePublisher} as the call style; the class is exported
 * for type imports and `instanceof` checks.
 */

import { defineEmitter, type Emitter } from "@/events/emitter.ts";
import {
  defineStateMachine,
  type ConnectionState,
  type StateMachine,
} from "@/state/connection-state.ts";
import type {
  SignalingMessageType,
  SignalingTransport,
  TransportState,
} from "@/signaling/transport.ts";
import type { PublisherEvents, PublisherOptions } from "./types.ts";

/**
 * Consumer-facing publisher orchestrator. Construct via {@link definePublisher}.
 */
export class Publisher {
  readonly room: string;
  readonly peerId: string;
  private readonly signaling: SignalingTransport;
  private readonly emitter: Emitter<PublisherEvents> = defineEmitter();
  private readonly stateMachine: StateMachine = defineStateMachine();
  private readonly disposers: (() => void)[] = [];

  constructor(opts: PublisherOptions) {
    this.signaling = opts.signaling;
    this.room = opts.room;
    this.peerId = opts.peerId ?? crypto.randomUUID();

    // Forward state machine changes to consumers as `state` events.
    this.stateMachine.on((s) => this.emitter.emit("state", s));
  }

  /** Current lifecycle state. */
  get state(): ConnectionState {
    return this.stateMachine.current();
  }

  /** Read-only list of connected viewer peer ids. Empty in EPIC-3b skeleton. */
  peers(): readonly string[] {
    return [];
  }

  /** Subscribe to a typed event. Returns an unsubscribe. */
  on<K extends keyof PublisherEvents>(
    event: K,
    handler: (payload: PublisherEvents[K]) => void,
  ): () => void {
    return this.emitter.on(event, handler);
  }

  /**
   * Connect signaling and join the room as a publisher. Transitions through
   * `connecting` → `connected` once signaling reaches its `connected` state.
   */
  async start(): Promise<void> {
    if (this.state !== "idle") return; // idempotent / no-op when already started

    this.stateMachine.transition("connecting");

    // Track signaling state changes so we move to `connected` exactly once
    // the transport reports connected.
    const offState = this.signaling.on("state", (s: TransportState) => {
      if (s === "connected") {
        this.stateMachine.transition("connected");
      } else if (s === "closed" && this.state !== "closed") {
        this.stateMachine.transition("failed");
      } else if (s === "reconnecting") {
        this.stateMachine.transition("reconnecting");
      }
    });
    this.disposers.push(offState);

    await this.signaling.connect();
    await this.sendJoin();
  }

  /**
   * Leave the room and disconnect signaling. Transitions to `closed`.
   * Idempotent — safe to call from cleanup paths.
   */
  async stop(): Promise<void> {
    if (this.state === "closed") return;
    try {
      await this.sendLeave();
    } catch {
      // Ignore send failures — we're shutting down anyway.
    }
    for (const d of this.disposers) d();
    this.disposers.length = 0;
    await this.signaling.disconnect();
    this.stateMachine.transition("closed");
  }

  private async sendJoin(): Promise<void> {
    const message: SignalingMessageType = {
      type: "join",
      room: this.room,
      peer: this.peerId,
      role: "publisher",
    };
    await this.signaling.send(message);
  }

  private async sendLeave(): Promise<void> {
    const message: SignalingMessageType = {
      type: "leave",
      room: this.room,
      peer: this.peerId,
    };
    await this.signaling.send(message);
  }
}

/**
 * Declarative factory for {@link Publisher}. Recommended call style.
 *
 * ```ts
 * const publisher = definePublisher({
 *   signaling,
 *   room: "demo",
 *   stream: await getUserMedia({ video: true, audio: true }),
 * });
 * await publisher.start();
 * ```
 */
export function definePublisher(opts: PublisherOptions): Publisher {
  return new Publisher(opts);
}
