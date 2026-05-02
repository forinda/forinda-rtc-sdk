/**
 * `Publisher` — the consumer-facing orchestrator for one-to-many video
 * publishing.
 *
 * Wraps the EPIC-3a primitives (`PeerConnection`, `Negotiator`,
 * `StatsCollector`) plus a `SignalingTransport`. Manages one
 * `RTCPeerConnection` per connected viewer; the publisher is the impolite
 * peer in perfect-negotiation collisions.
 *
 * EPIC-3b Tasks 4-5 ship signaling join + per-viewer PC management.
 * Subsequent tasks add SDP/ICE routing, stats, hot-swap, and retry.
 *
 * Prefer {@link definePublisher} as the call style; the class is exported
 * for type imports and `instanceof` checks.
 */

import { defineEmitter, type Emitter } from "@/events/emitter.ts";
import { defineNegotiator, type Negotiator } from "@/peer/negotiation.ts";
import { definePeerConnection, type PeerConnection } from "@/peer/peer-connection.ts";
import type {
  SignalingMessageType,
  SignalingTransport,
  TransportState,
} from "@/signaling/transport.ts";
import {
  defineStateMachine,
  type ConnectionState,
  type StateMachine,
} from "@/state/connection-state.ts";
import type { PublisherEvents, PublisherOptions } from "./types.ts";

/** Per-viewer state held by the publisher. */
interface ViewerEntry {
  peerId: string;
  pc: PeerConnection;
  negotiator: Negotiator;
  /** Disposers for any per-viewer listeners we need to detach on tear-down. */
  disposers: (() => void)[];
}

/**
 * Consumer-facing publisher orchestrator. Construct via {@link definePublisher}.
 */
export class Publisher {
  readonly room: string;
  readonly peerId: string;
  private readonly signaling: SignalingTransport;
  private readonly stream: MediaStream;
  private readonly iceServers: RTCIceServer[];
  private readonly pcFactory: PublisherOptions["pcFactory"];
  private readonly emitter: Emitter<PublisherEvents> = defineEmitter();
  private readonly stateMachine: StateMachine = defineStateMachine();
  private readonly disposers: (() => void)[] = [];
  private readonly viewers = new Map<string, ViewerEntry>();

  constructor(opts: PublisherOptions) {
    this.signaling = opts.signaling;
    this.room = opts.room;
    this.peerId = opts.peerId ?? crypto.randomUUID();
    this.stream = opts.stream;
    this.iceServers = opts.iceServers ?? [];
    this.pcFactory = opts.pcFactory;

    this.stateMachine.on((s) => this.emitter.emit("state", s));
  }

  /** Current lifecycle state. */
  get state(): ConnectionState {
    return this.stateMachine.current();
  }

  /** Read-only list of currently-connected viewer peer ids. */
  peers(): readonly string[] {
    return [...this.viewers.keys()];
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
    if (this.state !== "idle") return;

    this.stateMachine.transition("connecting");

    const offState = this.signaling.on("state", (s: TransportState) => {
      if (s === "connected") {
        this.stateMachine.transition("connected");
      } else if (s === "closed" && this.state !== "closed") {
        this.stateMachine.transition("failed");
      } else if (s === "reconnecting") {
        this.stateMachine.transition("reconnecting");
      }
    });
    const offMessage = this.signaling.on("message", (msg) => {
      void this.handleMessage(msg);
    });
    this.disposers.push(offState, offMessage);

    await this.signaling.connect();
    await this.sendJoin();
  }

  /**
   * Leave the room and disconnect signaling. Tears down every per-viewer PC
   * before the signaling disconnect so the leave broadcast still reaches
   * peers. Transitions to `closed`. Idempotent.
   */
  async stop(): Promise<void> {
    if (this.state === "closed") return;
    for (const viewer of this.viewers.values()) {
      this.teardownViewer(viewer.peerId);
    }
    try {
      await this.sendLeave();
    } catch {
      // Ignore send failures during shutdown.
    }
    for (const d of this.disposers) d();
    this.disposers.length = 0;
    await this.signaling.disconnect();
    this.stateMachine.transition("closed");
  }

  /** Internal: route an inbound signaling message. */
  private async handleMessage(msg: SignalingMessageType): Promise<void> {
    if (msg.type === "peer-joined" && msg.role === "viewer") {
      this.handleViewerJoined(msg.peer);
    } else if (msg.type === "peer-left") {
      this.teardownViewer(msg.peer);
    }
    // SDP/ICE routing handled in Task 6.
  }

  /**
   * Internal: spin up a fresh PC + Negotiator for a newly-arrived viewer.
   * Adds local stream tracks, wires ICE → signaling, and kicks off the
   * initial offer.
   */
  private handleViewerJoined(viewerPeerId: string): void {
    if (this.viewers.has(viewerPeerId)) return; // shouldn't happen but be defensive

    const pc = definePeerConnection({
      iceServers: this.iceServers,
      ...(this.pcFactory !== undefined ? { pcFactory: this.pcFactory } : {}),
    });

    for (const track of this.stream.getTracks()) {
      pc.raw.addTrack(track, this.stream);
    }

    const negotiator = defineNegotiator({
      pc: pc.raw,
      polite: false, // publisher is impolite by convention
      localPeerId: this.peerId,
      remotePeerId: viewerPeerId,
      send: (sdp) => this.signaling.send(sdp),
    });

    const offIce = pc.on("icecandidate", (candidate) => {
      // RTCIceCandidateInit is an interface without an index signature, so
      // it doesn't structurally satisfy `Record<string, unknown>` (the wire
      // format's candidate field). Cast through unknown — the protocol
      // forwards the payload opaquely anyway.
      const payload =
        candidate === null ? null : (candidate.toJSON() as unknown as Record<string, unknown>);
      void this.signaling.send({
        type: "ice",
        from: this.peerId,
        to: viewerPeerId,
        candidate: payload,
      });
    });

    const entry: ViewerEntry = {
      peerId: viewerPeerId,
      pc,
      negotiator,
      disposers: [offIce],
    };
    this.viewers.set(viewerPeerId, entry);
    this.emitter.emit("viewer", { peerId: viewerPeerId });

    // Kick off negotiation.
    void negotiator.makeOffer();
  }

  /** Internal: tear down a single viewer's PC + listeners. Idempotent. */
  private teardownViewer(viewerPeerId: string): void {
    const entry = this.viewers.get(viewerPeerId);
    if (entry === undefined) return;
    for (const d of entry.disposers) d();
    entry.pc.close();
    this.viewers.delete(viewerPeerId);
    this.emitter.emit("viewer-left", { peerId: viewerPeerId });
  }

  private async sendJoin(): Promise<void> {
    await this.signaling.send({
      type: "join",
      room: this.room,
      peer: this.peerId,
      role: "publisher",
    });
  }

  private async sendLeave(): Promise<void> {
    await this.signaling.send({
      type: "leave",
      room: this.room,
      peer: this.peerId,
    });
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
