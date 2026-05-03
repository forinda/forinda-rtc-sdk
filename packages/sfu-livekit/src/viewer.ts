/**
 * `defineSfuViewer` — subscribe to one specific publisher in a LiveKit
 * room and expose its tracks as a single `MediaStream`.
 *
 * The adapter filters incoming `TrackSubscribed` events by participant
 * identity so consumers only see the tracks they asked for. LiveKit
 * auto-subscribes to all published tracks by default; we mask that and
 * present a per-publisher view.
 */

import { defineEmitter, type Emitter, SdkError } from "@forinda/video-sdk-core";
import { SfuError } from "./errors.ts";
import type {
  SfuConnectionState,
  SfuViewer,
  SfuViewerEvents,
  SfuViewerOptions,
} from "./types.ts";

type RoomFactory = (opts: { token: string; url: string }) => unknown;

export interface InternalSfuViewerOptions extends SfuViewerOptions {
  /** **Internal.** Test seam — replaces `new Room()` from `livekit-client`. */
  __roomFactory?: RoomFactory;
}

interface MinimalRoom {
  state: string;
  connect: (url: string, token: string) => Promise<void>;
  disconnect: () => Promise<void>;
  on: (event: string, fn: (...args: unknown[]) => void) => unknown;
}

class SfuViewerImpl implements SfuViewer {
  readonly peerId: string;
  private readonly opts: InternalSfuViewerOptions;
  private readonly emitter: Emitter<SfuViewerEvents> = defineEmitter();
  private currentState: SfuConnectionState = "idle";
  private currentStream: MediaStream | null = null;
  private room: MinimalRoom | null = null;

  constructor(opts: InternalSfuViewerOptions) {
    this.opts = opts;
    this.peerId = opts.peerId;
  }

  get state(): SfuConnectionState {
    return this.currentState;
  }

  get stream(): MediaStream | null {
    return this.currentStream;
  }

  on<E extends keyof SfuViewerEvents>(
    event: E,
    handler: (payload: SfuViewerEvents[E]) => void,
  ): () => void {
    return this.emitter.on(event, handler);
  }

  async start(): Promise<void> {
    if (this.currentState !== "idle") return;
    this.setState("connecting");

    try {
      this.room = openRoom(this.opts);
      this.attachListeners(this.room);
      await this.room.connect(this.opts.url, this.opts.token);
      this.setState("connected");
    } catch (cause) {
      const code =
        cause instanceof Error && /token/i.test(cause.message)
          ? "sfu_token_invalid"
          : "sfu_connect_failed";
      const err = new SfuError("LiveKit viewer start failed", { code, cause });
      this.emitter.emit("error", err);
      this.setState("closed");
      throw err;
    }
  }

  async stop(): Promise<void> {
    if (this.currentState === "closed") return;
    if (this.room) await this.room.disconnect();
    if (this.currentStream) {
      for (const t of this.currentStream.getTracks()) t.stop();
      this.currentStream = null;
    }
    this.setState("closed");
  }

  private attachListeners(room: MinimalRoom): void {
    room.on("TrackSubscribed", (...args: unknown[]) => {
      const track = args[0] as { mediaStreamTrack: MediaStreamTrack };
      const participant = args[2] as { identity: string };
      if (participant.identity !== this.opts.publisherId) return;
      if (this.currentStream === null) this.currentStream = new MediaStream();
      this.currentStream.addTrack(track.mediaStreamTrack);
      this.emitter.emit("track", { stream: this.currentStream, track: track.mediaStreamTrack });
    });
    room.on("TrackUnsubscribed", (...args: unknown[]) => {
      const track = args[0] as { mediaStreamTrack: MediaStreamTrack };
      const participant = args[2] as { identity: string };
      if (participant.identity !== this.opts.publisherId) return;
      if (this.currentStream) this.currentStream.removeTrack(track.mediaStreamTrack);
    });
    room.on("Disconnected", () => {
      if (this.currentState !== "closed") {
        this.emitter.emit(
          "error",
          new SfuError("LiveKit room disconnected", { code: "sfu_disconnected" }) as SdkError,
        );
        this.setState("closed");
      }
    });
  }

  private setState(next: SfuConnectionState): void {
    if (this.currentState === next) return;
    this.currentState = next;
    this.emitter.emit("state", next);
  }
}

function openRoom(opts: InternalSfuViewerOptions): MinimalRoom {
  if (opts.__roomFactory) {
    return opts.__roomFactory(opts) as MinimalRoom;
  }
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { Room } = require("livekit-client");
  return new Room() as MinimalRoom;
}

/**
 * Build a LiveKit-backed viewer that subscribes only to the named
 * publisher's tracks and exposes them as a single accumulating
 * `MediaStream`.
 *
 * ```ts
 * const viewer = defineSfuViewer({
 *   url: "wss://my-lk.livekit.cloud",
 *   token: jwt,
 *   room: "webinar-2026",
 *   peerId: "viewer-1",
 *   publisherId: "host",
 * });
 * viewer.on("track", ({ stream }) => {
 *   videoEl.srcObject = stream;
 * });
 * await viewer.start();
 * ```
 */
export function defineSfuViewer(opts: SfuViewerOptions): SfuViewer {
  return new SfuViewerImpl(opts);
}
