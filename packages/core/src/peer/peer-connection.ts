/**
 * Thin typed wrapper over `RTCPeerConnection`.
 *
 * Owns lifecycle: construction (via injectable `pcFactory`), event fan-out
 * to typed listeners, and `close()`. Does NOT own negotiation logic — that's
 * the perfect-negotiation orchestrator (`./negotiation.ts`).
 *
 * Why an injectable `pcFactory`:
 * - Lets tests pass a fake without monkey-patching `globalThis`.
 * - Lets non-browser hosts (Node bots in a future epic) inject their own
 *   `RTCPeerConnection` impl.
 *
 * Default factory: `(config) => new RTCPeerConnection(config)`.
 *
 * Events surfaced (all typed via {@link PeerConnectionEvents}):
 * - `connectionstate` -> `RTCPeerConnectionState`
 * - `iceconnectionstate` -> `RTCIceConnectionState`
 * - `icecandidate` -> `RTCIceCandidate | null`
 * - `track` -> `RTCTrackEvent`
 */

import { defineEmitter, type Emitter } from "@/events/emitter.ts";

export type PcFactory = (config: RTCConfiguration) => RTCPeerConnection;

export interface PeerConnectionOptions {
  iceServers: RTCIceServer[];
  /** Override the constructor (useful for tests). Defaults to `globalThis.RTCPeerConnection`. */
  pcFactory?: PcFactory;
  /** Extra config passed to the underlying constructor. */
  rtcConfig?: Omit<RTCConfiguration, "iceServers">;
}

export type PeerConnectionEvents = {
  connectionstate: RTCPeerConnectionState;
  iceconnectionstate: RTCIceConnectionState;
  icecandidate: RTCIceCandidate | null;
  track: RTCTrackEvent;
};

const defaultPcFactory: PcFactory = (config) => new RTCPeerConnection(config);

/**
 * Wrapper around `RTCPeerConnection`. Subscribers receive typed events;
 * call {@link PeerConnection.close} to tear down.
 *
 * Prefer {@link definePeerConnection} as the call style.
 */
export class PeerConnection {
  /** The underlying `RTCPeerConnection` — exposed for callers that need the raw API. */
  readonly raw: RTCPeerConnection;
  private readonly emitter: Emitter<PeerConnectionEvents> = defineEmitter();
  private readonly disposers: (() => void)[] = [];

  constructor(opts: PeerConnectionOptions) {
    const factory = opts.pcFactory ?? defaultPcFactory;
    const config: RTCConfiguration = {
      ...opts.rtcConfig,
      iceServers: opts.iceServers,
    };
    this.raw = factory(config);
    this.bindEvents();
  }

  private bindEvents(): void {
    const onConn = (): void => {
      this.emitter.emit("connectionstate", this.raw.connectionState);
    };
    const onIce = (): void => {
      this.emitter.emit("iceconnectionstate", this.raw.iceConnectionState);
    };
    const onCand = (event: Event): void => {
      const candidate = (event as RTCPeerConnectionIceEvent).candidate ?? null;
      this.emitter.emit("icecandidate", candidate);
    };
    const onTrack = (event: Event): void => {
      this.emitter.emit("track", event as RTCTrackEvent);
    };

    this.raw.addEventListener("connectionstatechange", onConn);
    this.raw.addEventListener("iceconnectionstatechange", onIce);
    this.raw.addEventListener("icecandidate", onCand);
    this.raw.addEventListener("track", onTrack);

    this.disposers.push(
      () => this.raw.removeEventListener("connectionstatechange", onConn),
      () => this.raw.removeEventListener("iceconnectionstatechange", onIce),
      () => this.raw.removeEventListener("icecandidate", onCand),
      () => this.raw.removeEventListener("track", onTrack),
    );
  }

  /** Subscribe to a typed event. Returns an unsubscribe. */
  on<K extends keyof PeerConnectionEvents>(
    event: K,
    handler: (payload: PeerConnectionEvents[K]) => void,
  ): () => void {
    return this.emitter.on(event, handler);
  }

  /** Tear down: close the underlying PC and detach all listeners. */
  close(): void {
    for (const dispose of this.disposers) dispose();
    this.disposers.length = 0;
    this.emitter.removeAllListeners();
    this.raw.close();
  }
}

/**
 * Declarative factory for {@link PeerConnection}. Recommended call style.
 *
 * ```ts
 * const pc = definePeerConnection({
 *   iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
 * });
 * pc.on("connectionstate", (s) => console.log(s));
 * ```
 */
export function definePeerConnection(opts: PeerConnectionOptions): PeerConnection {
  return new PeerConnection(opts);
}
