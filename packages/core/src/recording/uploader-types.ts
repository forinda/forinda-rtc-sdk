/**
 * Type contract for the streaming-upload sink consumed by a `Recorder`.
 *
 * Implementations decide their own transport (HTTP, WebRTC data channel,
 * an in-memory queue for tests). The recorder pump only needs `send`,
 * `state`, `state` event, and the recovery hook (`retry`).
 */

/** Lifecycle of an `Uploader`. */
export type UploaderState = "idle" | "uploading" | "paused" | "failed" | "closed";

/** Typed event map for `Uploader`. */
export type UploaderEvents = {
  /** Lifecycle transition. */
  state: UploaderState;
  /** Fires after a chunk has been successfully delivered. */
  ack: { bytes: number; totalBytes: number };
  /** Fires whenever a `send` rejects or the queue overflows. */
  error: Error;
};

/** Common shape for any uploader sink. */
export interface Uploader {
  /** Current lifecycle state. Snapshot of the most recent `state` event. */
  readonly state: UploaderState;
  /** Bytes currently queued (waiting to be sent or in-flight). */
  readonly pendingBytes: number;
  /**
   * Hand a chunk to the uploader. Resolves once the chunk has been queued
   * (not necessarily delivered). Rejects when `maxQueuedBytes` would be
   * exceeded — the queue refuses the chunk and the consumer is expected
   * to back off.
   */
  send(chunk: Blob): Promise<void>;
  /** Subscribe to a typed event. Returns an unsubscribe. */
  on<E extends keyof UploaderEvents>(
    event: E,
    handler: (payload: UploaderEvents[E]) => void,
  ): () => void;
  /**
   * After a `failed` state, resume sending starting from the head of the
   * queue. Resolves once the next chunk's send has been issued (whether
   * it succeeds or fails). No-op when not in `failed`.
   */
  retry(): Promise<void>;
  /** Tear down. Clears the queue; subsequent `send` calls reject. */
  close(): void;
}

/** Constructor options for {@link defineUploader}. */
export interface UploaderOptions {
  /** Destination URL — `POST` per chunk. */
  url: string;
  /** Extra request headers (e.g. auth). `Content-Type` is set automatically from the chunk's `type`. */
  headers?: Record<string, string>;
  /**
   * Hard cap on bytes queued (waiting + in-flight). When exceeded, `send`
   * rejects with an `SdkError(code: "uploader_queue_overflow")`.
   * Default: `100 * 1024 * 1024` (100 MiB).
   */
  maxQueuedBytes?: number;
  /**
   * Threshold (bytes) at or below which the upload uses `fetch` with
   * `keepalive: true` so the request survives page unload. Above the
   * threshold the upload uses regular `fetch` because the browser limits
   * keepalive payloads (~64 KiB total in the spec). Default: `60_000`.
   */
  keepaliveThresholdBytes?: number;
  /** Test seam — replace `fetch`. Defaults to `globalThis.fetch`. */
  fetchImpl?: typeof fetch;
}
