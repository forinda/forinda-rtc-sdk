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

import { ConfigurationError, SdkError } from "@/errors/errors.ts";
import { defineEmitter, type Emitter } from "@/events/emitter.ts";
import { defineNegotiator, type Negotiator } from "@/peer/negotiation.ts";
import { definePeerConnection, type PeerConnection } from "@/peer/peer-connection.ts";
import {
  replaceAudioTrack as replaceAudioTrackOnPc,
  replaceVideoTrack as replaceVideoTrackOnPc,
} from "@/media/track-replacer.ts";
import { defineRetryPolicy, type RetryPolicy } from "@/retry/policy.ts";
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
import { defineStatsCollector, type StatsCollector } from "@/stats/collector.ts";
import type { ConnectionStats } from "@/stats/types.ts";
import type { PublisherEvents, PublisherOptions } from "./types.ts";

/** Per-viewer state held by the publisher. */
interface ViewerEntry {
  peerId: string;
  pc: PeerConnection;
  negotiator: Negotiator;
  collector?: StatsCollector;
  latestStats?: ConnectionStats;
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
  private readonly statsConfig: PublisherOptions["stats"];
  private readonly retryPolicy: RetryPolicy;
  private retryTimer: ReturnType<typeof setTimeout> | undefined;
  private successResetTimer: ReturnType<typeof setTimeout> | undefined;
  private stopping = false;

  constructor(opts: PublisherOptions) {
    this.signaling = opts.signaling;
    this.room = opts.room;
    this.peerId = opts.peerId ?? crypto.randomUUID();
    this.stream = opts.stream;
    this.iceServers = opts.iceServers ?? [];
    this.pcFactory = opts.pcFactory;
    this.statsConfig = opts.stats;
    this.retryPolicy = defineRetryPolicy(opts.retry ?? {});

    this.stateMachine.on((s) => {
      this.emitter.emit("state", s);
      if (s === "connected") this.scheduleSuccessReset();
    });
  }

  /**
   * Schedule a `markSuccess` call after the success-reset window so the
   * retry budget recovers if the session stays connected.
   */
  private scheduleSuccessReset(): void {
    if (this.successResetTimer !== undefined) clearTimeout(this.successResetTimer);
    // Small constant matches the default 30s window; consumers don't
    // override successResetMs at this layer (it's encoded in the policy).
    this.successResetTimer = setTimeout(() => {
      this.retryPolicy.markSuccess();
    }, 30_000);
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
      if (this.stopping) return;
      if (s === "connected") {
        this.stateMachine.transition("connected");
      } else if (s === "closed" && this.state !== "closed") {
        // Treat unexpected signaling close as a session failure → retry.
        this.handleSessionFailure(
          new SdkError("signaling closed unexpectedly", { code: "signaling_closed" }),
        );
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
    this.stopping = true;
    if (this.retryTimer !== undefined) {
      clearTimeout(this.retryTimer);
      this.retryTimer = undefined;
    }
    if (this.successResetTimer !== undefined) {
      clearTimeout(this.successResetTimer);
      this.successResetTimer = undefined;
    }
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

  /**
   * Internal: handle a session-level failure (signaling drop, etc.).
   * Transitions to `failed`, schedules retry if budget allows; otherwise
   * goes to `closed` with a `retry_exhausted` error.
   */
  private handleSessionFailure(cause: SdkError): void {
    if (this.stopping) return;
    this.stateMachine.transition("failed");

    // Tear down per-viewer state — we'll rebuild on reconnect. Snapshot
    // the peer ids first because teardownViewer mutates `this.viewers`.
    const viewerIds = Array.from(this.viewers.keys());
    for (const viewerId of viewerIds) {
      this.teardownViewer(viewerId);
    }

    const delay = this.retryPolicy.nextDelayMs();
    if (delay === null) {
      this.emitter.emit(
        "error",
        new SdkError("retry budget exhausted", {
          code: "retry_exhausted",
          cause,
        }),
      );
      this.stateMachine.transition("closed");
      return;
    }

    this.emitter.emit("retry", {
      attempt: this.retryPolicy.attempt,
      nextDelayMs: delay,
      lastError: cause,
    });

    this.retryTimer = setTimeout(() => {
      void this.attemptReconnect();
    }, delay);
  }

  /** Internal: full session restart after retry backoff. */
  private async attemptReconnect(): Promise<void> {
    if (this.stopping) return;
    this.stateMachine.transition("reconnecting");
    try {
      await this.signaling.connect();
      await this.sendJoin();
      // signaling state listener will transition us back to `connected`.
    } catch (cause) {
      this.handleSessionFailure(
        new SdkError("reconnect attempt failed", {
          code: "reconnect_failed",
          cause,
        }),
      );
    }
  }

  /** Internal: route an inbound signaling message. */
  private async handleMessage(msg: SignalingMessageType): Promise<void> {
    if (msg.type === "peer-joined" && msg.role === "viewer") {
      this.handleViewerJoined(msg.peer);
    } else if (msg.type === "peer-left") {
      this.teardownViewer(msg.peer);
    } else if (msg.type === "sdp") {
      await this.routeSdp(msg.from, msg.sdp);
    } else if (msg.type === "ice") {
      await this.routeIce(msg.from, msg.candidate);
    }
  }

  private async routeSdp(
    fromPeerId: string,
    sdp: { type: "offer" | "answer"; sdp: string },
  ): Promise<void> {
    const entry = this.viewers.get(fromPeerId);
    if (entry === undefined) return; // unknown viewer — drop silently
    await entry.negotiator.handleSdp(sdp);
  }

  private async routeIce(
    fromPeerId: string,
    candidate: Record<string, unknown> | null,
  ): Promise<void> {
    const entry = this.viewers.get(fromPeerId);
    if (entry === undefined) return;
    await entry.negotiator.handleIce(candidate as RTCIceCandidateInit | null);
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

    if (this.statsConfig !== undefined) {
      const collector = defineStatsCollector({
        pc: pc.raw,
        peerId: viewerPeerId,
        intervalMs: this.statsConfig.interval,
      });
      const offStats = collector.on("stats", (s) => {
        entry.latestStats = s;
        this.emitter.emit("stats", this.collectLatestStats());
      });
      entry.collector = collector;
      entry.disposers.push(offStats);
      collector.start();
    }

    this.viewers.set(viewerPeerId, entry);
    this.emitter.emit("viewer", { peerId: viewerPeerId });

    // Kick off negotiation.
    void negotiator.makeOffer();
  }

  /** Snapshot of the most recent stats per viewer. Empty until first poll. */
  private collectLatestStats(): ConnectionStats[] {
    const out: ConnectionStats[] = [];
    for (const v of this.viewers.values()) {
      if (v.latestStats !== undefined) out.push(v.latestStats);
    }
    return out;
  }

  /**
   * Manual one-shot stats snapshot — one entry per connected viewer.
   * Bypasses the polling loop.
   */
  async getStats(): Promise<ConnectionStats[]> {
    const out: ConnectionStats[] = [];
    for (const v of this.viewers.values()) {
      if (v.collector !== undefined) {
        out.push(await v.collector.collect());
      }
    }
    return out;
  }

  /**
   * Hot-swap the video track on every connected viewer's outbound stream.
   * Throws {@link ConfigurationError} when zero viewers are connected.
   */
  async replaceVideoTrack(track: MediaStreamTrack): Promise<void> {
    if (this.viewers.size === 0) {
      throw new ConfigurationError("no viewers connected — nothing to replace");
    }
    for (const v of this.viewers.values()) {
      await replaceVideoTrackOnPc(v.pc.raw, track);
    }
  }

  /**
   * Hot-swap the audio track on every connected viewer's outbound stream.
   * Throws {@link ConfigurationError} when zero viewers are connected.
   */
  async replaceAudioTrack(track: MediaStreamTrack): Promise<void> {
    if (this.viewers.size === 0) {
      throw new ConfigurationError("no viewers connected — nothing to replace");
    }
    for (const v of this.viewers.values()) {
      await replaceAudioTrackOnPc(v.pc.raw, track);
    }
  }

  /** Internal: tear down a single viewer's PC + listeners. Idempotent. */
  private teardownViewer(viewerPeerId: string): void {
    const entry = this.viewers.get(viewerPeerId);
    if (entry === undefined) return;
    entry.collector?.stop();
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
