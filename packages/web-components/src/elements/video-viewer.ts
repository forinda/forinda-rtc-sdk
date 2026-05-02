/**
 * `<forinda-video-viewer>` — declarative viewer element.
 *
 * Symmetric to `<forinda-video-publisher>` but on the receive side. Opens a WS
 * signaling channel, builds a {@link Viewer}, and renders the inbound remote
 * stream into a `<video>` in shadow DOM.
 *
 * @example
 * ```html
 * <forinda-video-viewer
 *   room="demo"
 *   publisher-id="alice"
 *   signaling-url="wss://signal.example.com"
 * ></forinda-video-viewer>
 * ```
 *
 * @fires ready  — `CustomEvent<{ stream: MediaStream; viewer: Viewer }>`
 * @fires state  — `CustomEvent<ConnectionState>`
 * @fires track  — `CustomEvent<{ stream: MediaStream }>` (first inbound track)
 * @fires error  — `CustomEvent<Error>`
 */

import {
  defineViewer,
  type SignalingTransport,
  type Viewer,
  type ViewerOptions,
} from "@forinda/video-sdk-core";
import { defineWebSocketSignaling } from "@forinda/video-sdk-signaling-ws";
import { readJson, readString } from "@/internal/attrs.ts";
import { dispatchTypedEvent } from "@/internal/send-event.ts";

export interface ViewerElementOverrides {
  signalingFactory?: (url: string) => SignalingTransport;
  viewerFactory?: (options: ViewerOptions) => Viewer;
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

export class ForindaVideoViewer extends HTMLElement {
  static readonly tagName = "forinda-video-viewer";

  overrides: ViewerElementOverrides = {};

  private videoEl: HTMLVideoElement;
  private signaling: SignalingTransport | null = null;
  private viewer: Viewer | null = null;
  private stream: MediaStream | null = null;
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

  /** Live `Viewer` instance once started; `null` otherwise. */
  get viewerInstance(): Viewer | null {
    return this.viewer;
  }

  /** Inbound `MediaStream` once the first `track` event fires; `null` otherwise. */
  get mediaStream(): MediaStream | null {
    return this.stream;
  }

  private async start(signal: AbortSignal): Promise<void> {
    const room = readString(this, "room");
    const publisherId = readString(this, "publisher-id");
    const signalingUrl = readString(this, "signaling-url");
    if (!room) {
      this.emitError(new Error("forinda-video-viewer: 'room' attribute is required"));
      return;
    }
    if (!publisherId) {
      this.emitError(new Error("forinda-video-viewer: 'publisher-id' attribute is required"));
      return;
    }
    if (!signalingUrl) {
      this.emitError(new Error("forinda-video-viewer: 'signaling-url' attribute is required"));
      return;
    }

    const iceServers = readJson<RTCIceServer[]>(this, "ice-servers", []);
    const peerId = readString(this, "peer-id") ?? undefined;

    if (!this.hasAttribute("manual-play")) {
      this.videoEl.muted = true;
      this.videoEl.autoplay = true;
      this.videoEl.playsInline = true;
    }

    try {
      const signalingFactory =
        this.overrides.signalingFactory ?? ((url) => defineWebSocketSignaling({ url }));
      const signaling = signalingFactory(signalingUrl);
      this.signaling = signaling;

      const viewerFactory = this.overrides.viewerFactory ?? defineViewer;
      const baseOptions: ViewerOptions = {
        signaling,
        room,
        publisherId,
        iceServers,
      };
      const options: ViewerOptions = peerId ? { ...baseOptions, peerId } : baseOptions;
      const viewer = viewerFactory(options);
      this.viewer = viewer;

      this.disposers.push(
        viewer.on("state", (state) => dispatchTypedEvent(this, "state", state)),
        viewer.on("track", ({ stream }) => {
          this.stream = stream;
          this.videoEl.srcObject = stream;
          dispatchTypedEvent(this, "track", { stream });
        }),
        viewer.on("error", (err) => dispatchTypedEvent(this, "error", err)),
      );

      await viewer.start();
      if (signal.aborted) return;
      dispatchTypedEvent(this, "ready", { viewer });
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
    void this.viewer?.stop();
    this.viewer = null;
    void this.signaling?.disconnect();
    this.signaling = null;
    this.stream = null;
    this.videoEl.srcObject = null;
  }

  private emitError(err: unknown): void {
    const error = err instanceof Error ? err : new Error(String(err));
    dispatchTypedEvent(this, "error", error);
  }
}
