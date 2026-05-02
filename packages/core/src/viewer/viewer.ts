/**
 * `Viewer` — the consumer-facing orchestrator for subscribing to a single
 * publisher's stream.
 *
 * Wraps EPIC-3a primitives (`PeerConnection`, `Negotiator`,
 * `StatsCollector`) plus a `SignalingTransport`. Owns one upstream
 * `RTCPeerConnection`. The viewer is the polite peer in
 * perfect-negotiation collisions (publisher is impolite).
 *
 * Lifecycle: state moves to `connected` once signaling is connected, the
 * upstream PC reaches `connectionState === "connected"`, AND the first
 * `track` event has fired (i.e. media is actually flowing).
 *
 * Prefer {@link defineViewer} as the call style.
 */

import { SdkError } from "@/errors/errors.ts";
import { defineEmitter, type Emitter } from "@/events/emitter.ts";
import { defineNegotiator, type Negotiator } from "@/peer/negotiation.ts";
import { definePeerConnection, type PeerConnection } from "@/peer/peer-connection.ts";
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
import type { ViewerEvents, ViewerOptions } from "./types.ts";

/** Consumer-facing viewer orchestrator. */
export class Viewer {
  readonly room: string;
  readonly peerId: string;
  readonly publisherId: string;
  private readonly signaling: SignalingTransport;
  private readonly iceServers: RTCIceServer[];
  private readonly pcFactory: ViewerOptions["pcFactory"];
  private readonly statsConfig: ViewerOptions["stats"];
  private readonly emitter: Emitter<ViewerEvents> = defineEmitter();
  private readonly stateMachine: StateMachine = defineStateMachine();
  private readonly retryPolicy: RetryPolicy;
  private readonly disposers: (() => void)[] = [];
  private pc: PeerConnection | undefined;
  private negotiator: Negotiator | undefined;
  private collector: StatsCollector | undefined;
  private currentStream: MediaStream | null = null;
  private signalingConnected = false;
  private pcConnected = false;
  private trackReceived = false;
  private retryTimer: ReturnType<typeof setTimeout> | undefined;
  private successResetTimer: ReturnType<typeof setTimeout> | undefined;
  private stopping = false;

  constructor(opts: ViewerOptions) {
    this.signaling = opts.signaling;
    this.room = opts.room;
    this.peerId = opts.peerId ?? crypto.randomUUID();
    this.publisherId = opts.publisherId;
    this.iceServers = opts.iceServers ?? [];
    this.pcFactory = opts.pcFactory;
    this.statsConfig = opts.stats;
    this.retryPolicy = defineRetryPolicy(opts.retry ?? {});

    this.stateMachine.on((s) => {
      this.emitter.emit("state", s);
      if (s === "connected") this.scheduleSuccessReset();
    });
  }

  /** Current lifecycle state. */
  get state(): ConnectionState {
    return this.stateMachine.current();
  }

  /** Current remote stream, or `null` if no track event has fired yet. */
  get stream(): MediaStream | null {
    return this.currentStream;
  }

  /** Subscribe to a typed event. Returns an unsubscribe. */
  on<K extends keyof ViewerEvents>(
    event: K,
    handler: (payload: ViewerEvents[K]) => void,
  ): () => void {
    return this.emitter.on(event, handler);
  }

  /** Connect signaling and join the room as a viewer. */
  async start(): Promise<void> {
    if (this.state !== "idle") return;
    this.stateMachine.transition("connecting");

    const offState = this.signaling.on("state", (s: TransportState) => {
      if (this.stopping) return;
      if (s === "connected") {
        this.signalingConnected = true;
        this.maybeMarkConnected();
      } else if (s === "closed" && this.state !== "closed") {
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

  /** Leave the room and tear down. Idempotent. */
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
    this.teardownPeer();
    try {
      await this.sendLeave();
    } catch {
      // ignore
    }
    for (const d of this.disposers) d();
    this.disposers.length = 0;
    await this.signaling.disconnect();
    this.stateMachine.transition("closed");
  }

  /**
   * One-shot stats snapshot for the upstream peer connection. Returns a
   * fresh `ConnectionStats` object regardless of polling state. Throws
   * when no PC is currently connected.
   */
  async getStats(): Promise<ConnectionStats> {
    if (this.collector === undefined) {
      // No stats collector configured/active; fabricate a minimal collector
      // for one-shot use against the current PC.
      if (this.pc === undefined) {
        throw new SdkError("no peer connection — viewer not connected", {
          code: "not_connected",
        });
      }
      const oneShot = defineStatsCollector({
        pc: this.pc.raw,
        peerId: this.publisherId,
        intervalMs: 1_000_000, // never auto-poll
      });
      return oneShot.collect();
    }
    return this.collector.collect();
  }

  /** Internal: route inbound signaling messages. */
  private async handleMessage(msg: SignalingMessageType): Promise<void> {
    if (msg.type === "peer-joined" && msg.role === "publisher" && msg.peer === this.publisherId) {
      this.handlePublisherJoined();
    } else if (msg.type === "peer-left" && msg.peer === this.publisherId) {
      this.teardownPeer();
    } else if (msg.type === "sdp" && msg.from === this.publisherId) {
      await this.negotiator?.handleSdp(msg.sdp);
    } else if (msg.type === "ice" && msg.from === this.publisherId) {
      await this.negotiator?.handleIce(msg.candidate as RTCIceCandidateInit | null);
    }
  }

  /** Build the per-publisher PC + Negotiator and wait for an offer. */
  private handlePublisherJoined(): void {
    if (this.pc !== undefined) return;

    const pc = definePeerConnection({
      iceServers: this.iceServers,
      ...(this.pcFactory !== undefined ? { pcFactory: this.pcFactory } : {}),
    });

    const negotiator = defineNegotiator({
      pc: pc.raw,
      polite: true, // viewer is polite by convention
      localPeerId: this.peerId,
      remotePeerId: this.publisherId,
      send: (sdp) => this.signaling.send(sdp),
    });

    const offIce = pc.on("icecandidate", (candidate) => {
      const payload =
        candidate === null ? null : (candidate.toJSON() as unknown as Record<string, unknown>);
      void this.signaling.send({
        type: "ice",
        from: this.peerId,
        to: this.publisherId,
        candidate: payload,
      });
    });

    const offConn = pc.on("connectionstate", (s) => {
      if (s === "connected") {
        this.pcConnected = true;
        this.maybeMarkConnected();
      } else if (s === "failed" && !this.stopping) {
        this.handleSessionFailure(new SdkError("peer connection failed", { code: "pc_failed" }));
      }
    });

    const offTrack = pc.on("track", (event) => {
      const stream = event.streams[0];
      if (stream === undefined) return;
      this.currentStream = stream;
      this.trackReceived = true;
      this.emitter.emit("track", { stream });
      this.maybeMarkConnected();
    });

    this.pc = pc;
    this.negotiator = negotiator;
    this.disposers.push(offIce, offConn, offTrack);

    if (this.statsConfig !== undefined) {
      const collector = defineStatsCollector({
        pc: pc.raw,
        peerId: this.publisherId,
        intervalMs: this.statsConfig.interval,
      });
      const offStats = collector.on("stats", (s) => this.emitter.emit("stats", s));
      this.collector = collector;
      this.disposers.push(offStats);
      collector.start();
    }
  }

  /**
   * Transition to `connected` only when all three preconditions are met:
   * signaling connected, PC connected, first track received.
   */
  private maybeMarkConnected(): void {
    if (this.stopping) return;
    if (this.signalingConnected && this.pcConnected && this.trackReceived) {
      this.stateMachine.transition("connected");
    }
  }

  private teardownPeer(): void {
    this.collector?.stop();
    this.collector = undefined;
    if (this.pc !== undefined) {
      this.pc.close();
      this.pc = undefined;
    }
    this.negotiator = undefined;
    this.currentStream = null;
    this.pcConnected = false;
    this.trackReceived = false;
  }

  private scheduleSuccessReset(): void {
    if (this.successResetTimer !== undefined) clearTimeout(this.successResetTimer);
    this.successResetTimer = setTimeout(() => {
      this.retryPolicy.markSuccess();
    }, 30_000);
  }

  private handleSessionFailure(cause: SdkError): void {
    if (this.stopping) return;
    this.stateMachine.transition("failed");
    this.teardownPeer();

    const delay = this.retryPolicy.nextDelayMs();
    if (delay === null) {
      this.emitter.emit(
        "error",
        new SdkError("retry budget exhausted", { code: "retry_exhausted", cause }),
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

  private async attemptReconnect(): Promise<void> {
    if (this.stopping) return;
    this.stateMachine.transition("reconnecting");
    this.signalingConnected = false;
    try {
      await this.signaling.connect();
      await this.sendJoin();
    } catch (cause) {
      this.handleSessionFailure(
        new SdkError("reconnect attempt failed", { code: "reconnect_failed", cause }),
      );
    }
  }

  private async sendJoin(): Promise<void> {
    await this.signaling.send({
      type: "join",
      room: this.room,
      peer: this.peerId,
      role: "viewer",
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
 * Declarative factory for {@link Viewer}. Recommended call style.
 *
 * ```ts
 * const viewer = defineViewer({
 *   signaling,
 *   room: "demo",
 *   publisherId: "alice",
 * });
 * viewer.on("track", ({ stream }) => { videoEl.srcObject = stream; });
 * await viewer.start();
 * ```
 */
export function defineViewer(opts: ViewerOptions): Viewer {
  return new Viewer(opts);
}
