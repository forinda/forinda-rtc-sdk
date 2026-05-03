/**
 * `defineSfuPublisher` — wrap LiveKit's `Room` + `LocalParticipant` to
 * publish a `MediaStream`'s tracks under a stable peer identity, with a
 * lifecycle and event surface that mirrors core's mesh `Publisher`.
 */

import { defineEmitter, type Emitter, SdkError } from "@forinda/video-sdk-core";
import { SfuError } from "./errors.ts";
import type {
  SfuConnectionState,
  SfuPublisher,
  SfuPublisherEvents,
  SfuPublisherOptions,
} from "./types.ts";

/** Internal escape hatch for tests: inject a fake `Room` factory. */
type RoomFactory = (opts: { token: string; url: string }) => unknown;

export interface InternalSfuPublisherOptions extends SfuPublisherOptions {
  /** **Internal.** Test seam — replaces `new Room()` from `livekit-client`. */
  __roomFactory?: RoomFactory;
}

interface MinimalRoom {
  state: string;
  localParticipant: {
    identity: string;
    publishTrack: (track: MediaStreamTrack) => Promise<unknown>;
    unpublishTrack: (pub: unknown) => Promise<unknown>;
  };
  remoteParticipants: Map<string, { identity: string }>;
  connect: (url: string, token: string) => Promise<void>;
  disconnect: () => Promise<void>;
  on: (event: string, fn: (...args: unknown[]) => void) => unknown;
}

class SfuPublisherImpl implements SfuPublisher {
  readonly peerId: string;
  private readonly opts: InternalSfuPublisherOptions;
  private readonly emitter: Emitter<SfuPublisherEvents> = defineEmitter();
  private currentState: SfuConnectionState = "idle";
  private room: MinimalRoom | null = null;
  private currentVideoTrack: { trackSid: string } | null = null;
  private currentAudioTrack: { trackSid: string } | null = null;

  constructor(opts: InternalSfuPublisherOptions) {
    this.opts = opts;
    this.peerId = opts.peerId;
  }

  get state(): SfuConnectionState {
    return this.currentState;
  }

  on<E extends keyof SfuPublisherEvents>(
    event: E,
    handler: (payload: SfuPublisherEvents[E]) => void,
  ): () => void {
    return this.emitter.on(event, handler);
  }

  peers(): readonly string[] {
    if (!this.room) return [];
    return [...this.room.remoteParticipants.keys()];
  }

  async start(): Promise<void> {
    if (this.currentState !== "idle") return;
    this.setState("connecting");

    try {
      this.room = await openRoom(this.opts);
      this.attachListeners(this.room);
      await this.room.connect(this.opts.url, this.opts.token);

      // Publish every track in the supplied stream.
      for (const track of this.opts.stream.getTracks()) {
        const pub = (await this.room.localParticipant.publishTrack(track)) as {
          trackSid: string;
        };
        if (track.kind === "video") this.currentVideoTrack = pub;
        else if (track.kind === "audio") this.currentAudioTrack = pub;
      }

      this.setState("connected");
    } catch (cause) {
      const code =
        cause instanceof Error && /token/i.test(cause.message)
          ? "sfu_token_invalid"
          : "sfu_connect_failed";
      const err = new SfuError("LiveKit publisher start failed", { code, cause });
      this.emitter.emit("error", err);
      this.setState("closed");
      throw err;
    }
  }

  async stop(): Promise<void> {
    if (this.currentState === "closed") return;
    if (this.room) await this.room.disconnect();
    this.setState("closed");
  }

  async replaceVideoTrack(track: MediaStreamTrack): Promise<void> {
    if (!this.room) throw new SfuError("publisher not started", { code: "sfu_publish_failed" });
    if (this.currentVideoTrack) {
      await this.room.localParticipant.unpublishTrack(this.currentVideoTrack);
    }
    this.currentVideoTrack = (await this.room.localParticipant.publishTrack(track)) as {
      trackSid: string;
    };
  }

  async replaceAudioTrack(track: MediaStreamTrack): Promise<void> {
    if (!this.room) throw new SfuError("publisher not started", { code: "sfu_publish_failed" });
    if (this.currentAudioTrack) {
      await this.room.localParticipant.unpublishTrack(this.currentAudioTrack);
    }
    this.currentAudioTrack = (await this.room.localParticipant.publishTrack(track)) as {
      trackSid: string;
    };
  }

  private attachListeners(room: MinimalRoom): void {
    room.on("ParticipantConnected", (...args: unknown[]) => {
      const p = args[0] as { identity: string };
      this.emitter.emit("viewer-joined", { peerId: p.identity });
    });
    room.on("ParticipantDisconnected", (...args: unknown[]) => {
      const p = args[0] as { identity: string };
      this.emitter.emit("viewer-left", { peerId: p.identity });
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

/**
 * Internal: open a LiveKit `Room`. Real path dynamically imports
 * `livekit-client` only when needed; tests inject a fake via
 * `__roomFactory` to avoid loading the real package.
 */
async function openRoom(opts: InternalSfuPublisherOptions): Promise<MinimalRoom> {
  if (opts.__roomFactory) {
    return opts.__roomFactory(opts) as MinimalRoom;
  }
  const livekit = (await import("livekit-client")) as { Room: new () => MinimalRoom };
  return new livekit.Room();
}

/**
 * Build a LiveKit-backed publisher. Wires LiveKit's `Room` lifecycle into
 * the same event surface as core's mesh `Publisher`.
 *
 * ```ts
 * const publisher = defineSfuPublisher({
 *   url: "wss://my-lk.livekit.cloud",
 *   token: jwt,
 *   room: "webinar-2026",
 *   peerId: "host",
 *   stream,
 * });
 * publisher.on("viewer-joined", ({ peerId }) => console.log(peerId));
 * await publisher.start();
 * ```
 */
export function defineSfuPublisher(opts: SfuPublisherOptions): SfuPublisher {
  return new SfuPublisherImpl(opts);
}
