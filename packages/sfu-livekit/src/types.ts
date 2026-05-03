/**
 * Public type surface for the LiveKit SFU adapter. Mirrors the core
 * `Publisher` / `Viewer` shape so swapping mesh→SFU is one factory call.
 */

import type { ConnectionStats, RetryConfig, SdkError } from "@forinda/video-sdk-core";

/**
 * Lifecycle vocabulary. Identical to core's `ConnectionState` minus
 * `failed` / `reconnecting` (LiveKit handles its own reconnect internally).
 */
export type SfuConnectionState = "idle" | "connecting" | "connected" | "closed";

export interface SfuPublisherOptions {
  /**
   * LiveKit signaling URL — typically `wss://<your-project>.livekit.cloud`
   * or `ws://localhost:7880` for self-host.
   */
  url: string;
  /** Server-minted JWT scoped to (room, participant identity, can-publish). */
  token: string;
  /** Room name (LiveKit `roomName`). */
  room: string;
  /** This participant's stable identifier; surfaces as `participant.identity` to viewers. */
  peerId: string;
  /** Local `MediaStream` whose tracks will be published. */
  stream: MediaStream;
  /** Reconnect tuning forwarded to LiveKit's own reconnect machinery. */
  retry?: RetryConfig;
  /** Stats poll interval in ms. Default 1000. */
  stats?: { interval: number };
}

export type SfuPublisherEvents = {
  state: SfuConnectionState;
  /** Fires when a remote participant subscribes to one of our tracks. */
  "viewer-joined": { peerId: string };
  /** Fires when a remote participant unsubscribes / disconnects. */
  "viewer-left": { peerId: string };
  /** Per-poll stats snapshot. */
  stats: ConnectionStats[];
  error: SdkError;
};

export interface SfuPublisher {
  readonly state: SfuConnectionState;
  readonly peerId: string;
  /** Subscribe to a typed event. Returns an unsubscribe. */
  on<E extends keyof SfuPublisherEvents>(
    event: E,
    handler: (payload: SfuPublisherEvents[E]) => void,
  ): () => void;
  /** Open the LiveKit room + publish all tracks from `stream`. */
  start(): Promise<void>;
  /** Disconnect from the room. Idempotent. */
  stop(): Promise<void>;
  /** Hot-swap the published video track — mirrors core Publisher's API. */
  replaceVideoTrack(track: MediaStreamTrack): Promise<void>;
  /** Same for audio. */
  replaceAudioTrack(track: MediaStreamTrack): Promise<void>;
  /** Snapshot of currently subscribed peers (LiveKit `RemoteParticipant.identity`s). */
  peers(): readonly string[];
}

export interface SfuViewerOptions {
  url: string;
  token: string;
  room: string;
  /** Our identity in the room. Distinct from `publisherId` below. */
  peerId: string;
  /** The participant identity we want to subscribe to. */
  publisherId: string;
  retry?: RetryConfig;
  stats?: { interval: number };
}

export type SfuViewerEvents = {
  state: SfuConnectionState;
  /**
   * Fires whenever a new track from the target publisher is subscribed.
   * The stream cumulatively contains every track received so far.
   */
  track: { stream: MediaStream; track: MediaStreamTrack };
  stats: ConnectionStats | null;
  error: SdkError;
};

export interface SfuViewer {
  readonly state: SfuConnectionState;
  readonly peerId: string;
  on<E extends keyof SfuViewerEvents>(
    event: E,
    handler: (payload: SfuViewerEvents[E]) => void,
  ): () => void;
  start(): Promise<void>;
  stop(): Promise<void>;
  /** Live `MediaStream` of the publisher's tracks. `null` until the first `track` event fires. */
  readonly stream: MediaStream | null;
}
