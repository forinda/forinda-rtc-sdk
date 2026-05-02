/**
 * `Recorder` — typed wrapper around the browser's `MediaRecorder` API.
 *
 * Picks a supported mime type from `codecPreferences` (or honors an explicit
 * `mimeType`), forwards bitrate hints, and exposes a tiny state machine
 * (`idle → recording → (paused ↔ recording) → stopped`) plus typed events.
 * Chunks accumulate into `chunks: Blob[]`; the final `Blob` is assembled
 * on `stop()` and resolved from the returned promise.
 *
 * Errors from the underlying recorder become `error` events with native
 * `Error` instances — never bare DOM events.
 *
 * Prefer {@link defineRecorder} as the call style; the class is exported
 * for type imports and `instanceof` checks.
 */

import { ConfigurationError, SdkError } from "@/errors/errors.ts";
import { defineEmitter, type Emitter } from "@/events/emitter.ts";
import {
  DEFAULT_CODEC_PREFERENCES,
  isRecordingTypeSupported,
  pickRecordingType,
} from "./codec-support.ts";
import type { RecorderEvents, RecorderOptions, RecorderState } from "./types.ts";

export class Recorder {
  private readonly stream: MediaStream;
  private readonly options: RecorderOptions;
  private readonly emitter: Emitter<RecorderEvents> = defineEmitter();
  private readonly chunkList: Blob[] = [];
  private bufferedBytes = 0;
  private mediaRecorder: MediaRecorder | null = null;
  private resolvedMimeType: string | null = null;
  private recorderState: RecorderState = "idle";
  private startedAt = 0;
  private stopResolver: ((blob: Blob) => void) | null = null;

  constructor(stream: MediaStream, options: RecorderOptions = {}) {
    this.stream = stream;
    this.options = options;
  }

  /** Subscribe to a typed recorder event. Returns an unsubscribe. */
  on<E extends keyof RecorderEvents>(
    event: E,
    handler: (payload: RecorderEvents[E]) => void,
  ): () => void {
    return this.emitter.on(event, handler);
  }

  /** Current state. */
  get state(): RecorderState {
    return this.recorderState;
  }

  /** Sum of `data.size` across every retained chunk. */
  get bufferedByteCount(): number {
    return this.bufferedBytes;
  }

  /** Read-only chunk buffer (oldest first). */
  get chunks(): readonly Blob[] {
    return this.chunkList;
  }

  /** Resolved mime type (`null` until `start()` is called). */
  get mimeType(): string | null {
    return this.resolvedMimeType;
  }

  /**
   * Open the underlying `MediaRecorder` and begin recording. Resolves the
   * mime type from `options.mimeType` first, then `options.codecPreferences`
   * (defaulting to {@link DEFAULT_CODEC_PREFERENCES}). Throws
   * {@link ConfigurationError} when no candidate is supported.
   */
  start(): void {
    if (this.recorderState !== "idle") {
      throw new ConfigurationError(`Recorder.start: cannot start in state '${this.recorderState}'`);
    }

    const mimeType = this.resolveMimeType();
    if (mimeType === null) {
      throw new ConfigurationError(
        "Recorder.start: no supported mime type found (provided / default codec preferences not accepted by MediaRecorder)",
      );
    }
    this.resolvedMimeType = mimeType;

    const initOptions: MediaRecorderOptions = { mimeType };
    if (this.options.videoBitsPerSecond !== undefined) {
      initOptions.videoBitsPerSecond = this.options.videoBitsPerSecond;
    }
    if (this.options.audioBitsPerSecond !== undefined) {
      initOptions.audioBitsPerSecond = this.options.audioBitsPerSecond;
    }

    let recorder: MediaRecorder;
    try {
      recorder = new MediaRecorder(this.stream, initOptions);
    } catch (cause) {
      this.transition("error");
      const err = new SdkError("Recorder.start: MediaRecorder construction failed", {
        code: "recorder_start_failed",
        cause,
      });
      this.emitter.emit("error", err);
      throw err;
    }
    this.mediaRecorder = recorder;
    this.attachListeners(recorder);

    if (this.options.timesliceMs !== undefined) {
      recorder.start(this.options.timesliceMs);
    } else {
      recorder.start();
    }

    this.startedAt = Date.now();
    this.transition("recording");
    this.emitter.emit("start", { mimeType });
  }

  /**
   * Stop the recorder and return the assembled `Blob`. Idempotent — calling
   * stop on an already-stopped recorder resolves with the existing blob.
   */
  async stop(): Promise<Blob> {
    if (this.mediaRecorder === null || this.recorderState === "stopped") {
      return this.assembleBlob();
    }
    if (this.recorderState === "idle" || this.recorderState === "error") {
      return this.assembleBlob();
    }

    return new Promise<Blob>((resolve) => {
      this.stopResolver = resolve;
      this.mediaRecorder?.stop();
    });
  }

  /** Pause the underlying recorder. No-op when not recording. */
  pause(): void {
    if (this.recorderState !== "recording" || this.mediaRecorder === null) return;
    this.mediaRecorder.pause();
  }

  /** Resume after `pause()`. No-op when not paused. */
  resume(): void {
    if (this.recorderState !== "paused" || this.mediaRecorder === null) return;
    this.mediaRecorder.resume();
  }

  private resolveMimeType(): string | null {
    if (this.options.mimeType !== undefined) {
      return isRecordingTypeSupported(this.options.mimeType) ? this.options.mimeType : null;
    }
    return pickRecordingType(this.options.codecPreferences ?? DEFAULT_CODEC_PREFERENCES);
  }

  private attachListeners(recorder: MediaRecorder): void {
    recorder.addEventListener("dataavailable", (event) => {
      const data = (event as BlobEvent).data;
      if (!data || data.size === 0) return;
      const limit = this.options.maxBufferedBytes;
      if (limit !== undefined && this.bufferedBytes + data.size > limit) {
        this.emitter.emit("buffer-overflow", {
          bufferedBytes: this.bufferedBytes,
          limit,
        });
        const err = new SdkError(
          `Recorder: in-memory buffer would exceed maxBufferedBytes=${limit}`,
          { code: "recorder_buffer_overflow" },
        );
        this.transition("error");
        this.emitter.emit("error", err);
        try {
          recorder.stop();
        } catch {
          // Recorder may already be transitioning; suppress secondary errors.
        }
        return;
      }
      this.chunkList.push(data);
      this.bufferedBytes += data.size;
      this.emitter.emit("dataavailable", { data, timestamp: Date.now() });
    });
    recorder.addEventListener("pause", () => {
      this.transition("paused");
      this.emitter.emit("pause", undefined);
    });
    recorder.addEventListener("resume", () => {
      this.transition("recording");
      this.emitter.emit("resume", undefined);
    });
    recorder.addEventListener("stop", () => {
      this.transition("stopped");
      const blob = this.assembleBlob();
      this.emitter.emit("stop", {
        blob,
        mimeType: this.resolvedMimeType ?? "application/octet-stream",
        durationMs: Math.max(0, Date.now() - this.startedAt),
      });
      const resolver = this.stopResolver;
      this.stopResolver = null;
      resolver?.(blob);
    });
    recorder.addEventListener("error", (event) => {
      const native = (event as unknown as { error?: unknown }).error;
      const err =
        native instanceof Error
          ? native
          : new SdkError("MediaRecorder error", { code: "recorder_runtime_error" });
      this.transition("error");
      this.emitter.emit("error", err);
    });
  }

  private assembleBlob(): Blob {
    const type = this.resolvedMimeType ?? "application/octet-stream";
    return new Blob(this.chunkList, { type });
  }

  private transition(next: RecorderState): void {
    if (this.recorderState === next) return;
    this.recorderState = next;
    this.emitter.emit("state", next);
  }
}

/**
 * Declarative factory for {@link Recorder}. Recommended call style.
 *
 * ```ts
 * const recorder = defineRecorder(stream, {
 *   mimeType: "video/webm;codecs=vp9,opus",
 *   videoBitsPerSecond: 2_500_000,
 * });
 * recorder.on("stop", ({ blob }) => downloadAs("clip.webm", blob));
 * recorder.start();
 * // ... later
 * await recorder.stop();
 * ```
 */
export function defineRecorder(stream: MediaStream, opts: RecorderOptions = {}): Recorder {
  return new Recorder(stream, opts);
}
