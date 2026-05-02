/**
 * `<forinda-recorder>` — declarative recording element wrapping
 * `defineRecorder` from `@forinda/video-sdk-core`.
 *
 * The `MediaStream` to record is set as a JS property (`el.stream = ...`)
 * because streams are not serializable into HTML attributes. Codec and
 * bitrate knobs are attributes; lifecycle (`start` / `stop` / `pause` /
 * `resume`) is exposed as methods AND auto-driven by the toolbar button
 * inside the shadow DOM.
 *
 * @example
 * ```html
 * <forinda-recorder
 *   mime-type="video/webm;codecs=vp9,opus"
 *   video-bps="2000000"
 * ></forinda-recorder>
 * <script type="module">
 *   const el = document.querySelector("forinda-recorder");
 *   el.stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
 *   // Click the toolbar button OR call el.start() programmatically.
 * </script>
 * ```
 *
 * @fires recorder-start — `CustomEvent<{ mimeType: string }>`
 * @fires recorder-stop  — `CustomEvent<{ blob: Blob; mimeType: string; durationMs: number; url: string }>`
 * @fires recorder-error — `CustomEvent<Error>`
 */

import {
  defineRecorder,
  type Recorder,
  type RecorderOptions,
  type RecorderState,
} from "@forinda/video-sdk-core";
import { readNumber, readString } from "@/internal/attrs.ts";
import { dispatchTypedEvent } from "@/internal/send-event.ts";

const STYLE_CSS = `
  :host { display: inline-flex; align-items: center; gap: 0.5rem; font: inherit; }
  button {
    font: inherit;
    padding: 0.4rem 0.8rem;
    border-radius: 6px;
    border: 1px solid currentColor;
    background: transparent;
    cursor: pointer;
  }
  button[data-state="recording"] { background: crimson; color: white; border-color: crimson; }
  span { opacity: 0.7; }
`;

function buildShadow(host: HTMLElement): {
  button: HTMLButtonElement;
  status: HTMLSpanElement;
} {
  const shadow = host.attachShadow({ mode: "open" });
  const style = document.createElement("style");
  style.textContent = STYLE_CSS;
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = "Record";
  button.setAttribute("part", "button");
  button.dataset.state = "idle";
  const status = document.createElement("span");
  status.setAttribute("part", "status");
  status.textContent = "idle";
  shadow.append(style, button, status);
  return { button, status };
}

export class ForindaRecorder extends HTMLElement {
  static readonly tagName = "forinda-recorder";

  private buttonEl: HTMLButtonElement;
  private statusEl: HTMLSpanElement;
  private recorder: Recorder | null = null;
  private streamRef: MediaStream | null = null;

  constructor() {
    super();
    const built = buildShadow(this);
    this.buttonEl = built.button;
    this.statusEl = built.status;
    this.buttonEl.addEventListener("click", () => {
      if (this.recorder?.state === "recording" || this.recorder?.state === "paused") {
        void this.stop();
      } else {
        this.start();
      }
    });
  }

  /** Set or replace the source `MediaStream`. Tearing it down stops any active recording. */
  set stream(stream: MediaStream | null) {
    this.streamRef = stream;
    if (this.hasAttribute("auto-start") && stream !== null && this.recorder === null) {
      this.start();
    }
  }
  get stream(): MediaStream | null {
    return this.streamRef;
  }

  /** Live `Recorder` instance once `start()` has been called; `null` otherwise. */
  get recorderInstance(): Recorder | null {
    return this.recorder;
  }

  connectedCallback(): void {
    this.renderState("idle");
  }

  disconnectedCallback(): void {
    if (this.recorder?.state === "recording" || this.recorder?.state === "paused") {
      void this.recorder.stop();
    }
    this.recorder = null;
  }

  start(): void {
    if (this.streamRef === null) {
      this.emitError(new Error("forinda-recorder: stream property must be set before start()"));
      return;
    }
    if (this.recorder !== null) return;

    const opts: RecorderOptions = {};
    const mimeType = readString(this, "mime-type");
    if (mimeType !== null) opts.mimeType = mimeType;
    const videoBps = readNumber(this, "video-bps", 0);
    if (videoBps > 0) opts.videoBitsPerSecond = videoBps;
    const audioBps = readNumber(this, "audio-bps", 0);
    if (audioBps > 0) opts.audioBitsPerSecond = audioBps;
    const timeslice = readNumber(this, "timeslice-ms", 0);
    if (timeslice > 0) opts.timesliceMs = timeslice;

    const r = defineRecorder(this.streamRef, opts);
    this.recorder = r;

    r.on("state", (s) => this.renderState(s));
    r.on("start", (payload) => {
      dispatchTypedEvent(this, "recorder-start", payload);
    });
    r.on("stop", ({ blob, mimeType: mt, durationMs }) => {
      const url = URL.createObjectURL(blob);
      dispatchTypedEvent(this, "recorder-stop", { blob, mimeType: mt, durationMs, url });
    });
    r.on("error", (err) => this.emitError(err));

    try {
      r.start();
    } catch (err) {
      this.emitError(err);
      this.recorder = null;
    }
  }

  async stop(): Promise<Blob | null> {
    if (this.recorder === null) return null;
    return this.recorder.stop();
  }

  pause(): void {
    this.recorder?.pause();
  }

  resume(): void {
    this.recorder?.resume();
  }

  private renderState(state: RecorderState): void {
    this.statusEl.textContent = state;
    this.buttonEl.dataset.state = state;
    if (state === "recording" || state === "paused") {
      this.buttonEl.textContent = "Stop";
    } else {
      this.buttonEl.textContent = "Record";
    }
  }

  private emitError(err: unknown): void {
    const error = err instanceof Error ? err : new Error(String(err));
    dispatchTypedEvent(this, "recorder-error", error);
  }
}
