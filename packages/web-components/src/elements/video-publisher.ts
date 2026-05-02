/**
 * `<forinda-video-publisher>` — declarative publisher element.
 *
 * Wraps {@link Publisher} from `@forinda/video-sdk-core` plus
 * `defineWebSocketSignaling` from `@forinda/video-sdk-signaling-ws`. Acquires a
 * local `MediaStream` via `getUserMedia`, opens a WS signaling channel, and
 * publishes one-to-many until disconnected from the DOM.
 *
 * @example
 * ```html
 * <forinda-video-publisher
 *   room="demo"
 *   signaling-url="wss://signal.example.com"
 *   ice-servers='[{"urls":"stun:stun.l.google.com:19302"}]'
 *   audio video mirror
 * ></forinda-video-publisher>
 * ```
 *
 * @fires ready  — `CustomEvent<{ stream: MediaStream; publisher: Publisher }>`
 * @fires state  — `CustomEvent<ConnectionState>` (publisher state machine)
 * @fires viewer — `CustomEvent<ViewerInfo>` (a viewer joined)
 * @fires viewer-left — `CustomEvent<ViewerInfo>`
 * @fires error  — `CustomEvent<Error>`
 */

import {
  definePublisher,
  type Publisher,
  type PublisherOptions,
  type SignalingTransport,
} from "@forinda/video-sdk-core";
import { defineWebSocketSignaling } from "@forinda/video-sdk-signaling-ws";
import { readBoolean, readJson, readString } from "@/internal/attrs.ts";
import { dispatchTypedEvent } from "@/internal/send-event.ts";

export type PublisherSource = "camera" | "screen";

/**
 * Injection points for tests. Production usage leaves these undefined and the
 * element falls back to native `getUserMedia` / `getDisplayMedia`, the WS
 * signaling factory, and `definePublisher`.
 */
export interface PublisherElementOverrides {
  getUserMedia?: (constraints: MediaStreamConstraints) => Promise<MediaStream>;
  getDisplayMedia?: (constraints: DisplayMediaStreamOptions) => Promise<MediaStream>;
  signalingFactory?: (url: string) => SignalingTransport;
  publisherFactory?: (options: PublisherOptions) => Publisher;
}

const STYLE_CSS = `
  :host { display: inline-block; }
  video {
    width: 100%;
    height: 100%;
    display: block;
    object-fit: cover;
    background: #000;
  }
  :host([mirror]) video { transform: scaleX(-1); }
`;

function buildShadow(host: HTMLElement): HTMLVideoElement {
  const shadow = host.attachShadow({ mode: "open" });
  const style = document.createElement("style");
  style.textContent = STYLE_CSS;
  const video = document.createElement("video");
  video.setAttribute("part", "video");
  shadow.append(style, video);
  return video;
}

export class ForindaVideoPublisher extends HTMLElement {
  static readonly tagName = "forinda-video-publisher";

  overrides: PublisherElementOverrides = {};

  private videoEl: HTMLVideoElement;
  private stream: MediaStream | null = null;
  private signaling: SignalingTransport | null = null;
  private publisher: Publisher | null = null;
  private abortController: AbortController | null = null;
  private disposers: Array<() => void> = [];

  constructor() {
    super();
    this.videoEl = buildShadow(this);
  }

  connectedCallback(): void {
    if (this.abortController) return;
    this.abortController = new AbortController();
    void this.start(this.abortController.signal);
  }

  disconnectedCallback(): void {
    this.teardown();
  }

  /** Live `Publisher` instance once started; `null` otherwise. */
  get publisherInstance(): Publisher | null {
    return this.publisher;
  }

  /** Live local `MediaStream` once acquired; `null` otherwise. */
  get mediaStream(): MediaStream | null {
    return this.stream;
  }

  private async start(signal: AbortSignal): Promise<void> {
    const room = readString(this, "room");
    const signalingUrl = readString(this, "signaling-url");
    if (!room) {
      this.emitError(new Error("forinda-video-publisher: 'room' attribute is required"));
      return;
    }
    if (!signalingUrl) {
      this.emitError(new Error("forinda-video-publisher: 'signaling-url' attribute is required"));
      return;
    }

    const source = (readString(this, "source") ?? "camera") as PublisherSource;
    const iceServers = readJson<RTCIceServer[]>(this, "ice-servers", []);
    const peerId = readString(this, "peer-id") ?? undefined;

    try {
      const stream = await this.acquireStream(source);
      if (signal.aborted) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      this.stream = stream;
      this.videoEl.srcObject = stream;
      if (!this.hasAttribute("manual-play")) {
        this.videoEl.muted = true;
        this.videoEl.autoplay = true;
        this.videoEl.playsInline = true;
      }

      const signalingFactory =
        this.overrides.signalingFactory ?? ((url) => defineWebSocketSignaling({ url }));
      const signaling = signalingFactory(signalingUrl);
      this.signaling = signaling;

      const publisherFactory = this.overrides.publisherFactory ?? definePublisher;
      const baseOptions: PublisherOptions = { signaling, room, stream, iceServers };
      const options: PublisherOptions = peerId ? { ...baseOptions, peerId } : baseOptions;
      const publisher = publisherFactory(options);
      this.publisher = publisher;

      this.disposers.push(
        publisher.on("state", (state) => dispatchTypedEvent(this, "state", state)),
        publisher.on("viewer", (info) => dispatchTypedEvent(this, "viewer", info)),
        publisher.on("viewer-left", (info) => dispatchTypedEvent(this, "viewer-left", info)),
        publisher.on("error", (err) => dispatchTypedEvent(this, "error", err)),
      );

      await publisher.start();
      if (signal.aborted) return;
      dispatchTypedEvent(this, "ready", { stream, publisher });
    } catch (err) {
      if (signal.aborted) return;
      this.emitError(err);
    }
  }

  private teardown(): void {
    this.abortController?.abort();
    this.abortController = null;
    for (const dispose of this.disposers) dispose();
    this.disposers = [];
    void this.publisher?.stop();
    this.publisher = null;
    void this.signaling?.disconnect();
    this.signaling = null;
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.videoEl.srcObject = null;
  }

  private async acquireStream(source: PublisherSource): Promise<MediaStream> {
    if (source === "screen") {
      const shareAudio = readBoolean(this, "share-audio");
      const getDisplayMedia =
        this.overrides.getDisplayMedia ??
        ((c) =>
          (
            navigator.mediaDevices as MediaDevices & {
              getDisplayMedia: (c: DisplayMediaStreamOptions) => Promise<MediaStream>;
            }
          ).getDisplayMedia(c));
      return getDisplayMedia({ audio: shareAudio, video: true });
    }

    const wantsAudio = readBoolean(this, "audio");
    const wantsVideo = readBoolean(this, "video");
    const noneSpecified = !wantsAudio && !wantsVideo;
    const constraints: MediaStreamConstraints = {
      audio: wantsAudio || noneSpecified,
      video: wantsVideo || noneSpecified,
    };
    const getUserMedia =
      this.overrides.getUserMedia ?? ((c) => navigator.mediaDevices.getUserMedia(c));
    return getUserMedia(constraints);
  }

  private emitError(err: unknown): void {
    const error = err instanceof Error ? err : new Error(String(err));
    dispatchTypedEvent(this, "error", error);
  }
}
