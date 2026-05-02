/**
 * Option, event, and snapshot shapes for {@link "./recorder.ts".Recorder}.
 */

/** Lifecycle of a {@link Recorder}. */
export type RecorderState = "idle" | "recording" | "paused" | "stopped" | "error";

/** Constructor options for {@link defineRecorder}. */
export interface RecorderOptions {
  /**
   * Preferred mime type (e.g. `"video/webm;codecs=vp9,opus"`). When omitted
   * the recorder picks the first supported entry from `codecPreferences`.
   * Throws {@link ConfigurationError} on `start()` if neither path resolves
   * to a supported type.
   */
  mimeType?: string;
  /**
   * Ordered fallback list, consulted only when `mimeType` is not supplied.
   * Default: {@link DEFAULT_CODEC_PREFERENCES}.
   */
  codecPreferences?: readonly string[];
  /** Forwarded to `MediaRecorder` constructor. */
  videoBitsPerSecond?: number;
  /** Forwarded to `MediaRecorder` constructor. */
  audioBitsPerSecond?: number;
  /**
   * When set, the underlying recorder emits a `dataavailable` chunk every
   * `timesliceMs` ms instead of only on stop. Useful for streaming uploads.
   */
  timesliceMs?: number;
  /**
   * Hard cap on total in-memory chunk bytes. When exceeded the recorder
   * emits a `buffer-overflow` event, transitions to `error`, and stops the
   * underlying `MediaRecorder`. Prevents OOM on multi-hour recordings when
   * the consumer hasn't drained chunks via `timesliceMs` + an uploader.
   *
   * Default: unbounded.
   */
  maxBufferedBytes?: number;
}

/** One chunk delivered via `dataavailable` (raw `MediaRecorder` blob plus a wall-clock stamp). */
export interface RecorderChunk {
  data: Blob;
  timestamp: number;
}

/** Typed event map emitted by `Recorder`. */
export type RecorderEvents = {
  start: { mimeType: string };
  dataavailable: RecorderChunk;
  pause: void;
  resume: void;
  stop: { blob: Blob; mimeType: string; durationMs: number };
  /** Fires when `maxBufferedBytes` is exceeded, before the recorder errors out. */
  "buffer-overflow": { bufferedBytes: number; limit: number };
  error: Error;
  state: RecorderState;
};
