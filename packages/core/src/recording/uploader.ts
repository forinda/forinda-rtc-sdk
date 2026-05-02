/**
 * `defineUploader` — HTTP-POST-per-chunk upload sink for streaming
 * recordings off the device.
 *
 * Uses `fetch` with `keepalive: true` for chunks at or below
 * `keepaliveThresholdBytes` so chunks survive a page unload (sub-64 KiB
 * is the practical browser limit). Larger chunks fall back to regular
 * `fetch`.
 *
 * Backpressure: the internal FIFO queue caps total queued bytes at
 * `maxQueuedBytes`; over-cap `send` calls reject with `uploader_queue_overflow`.
 * Consumers wired through `pipeRecorderTo` translate that into a
 * `recorder.pause()`. After a `failed` state, the consumer must call
 * `retry()` to resume — no implicit retry loop.
 */

import { SdkError } from "@/errors/errors.ts";
import { defineEmitter, type Emitter } from "@/events/emitter.ts";
import type { Uploader, UploaderEvents, UploaderOptions, UploaderState } from "./uploader-types.ts";

const DEFAULT_MAX_QUEUED_BYTES = 100 * 1024 * 1024;
const DEFAULT_KEEPALIVE_THRESHOLD_BYTES = 60_000;

interface QueueEntry {
  blob: Blob;
  bytes: number;
}

class HttpUploader implements Uploader {
  private readonly url: string;
  private readonly headers: Record<string, string>;
  private readonly maxQueuedBytes: number;
  private readonly keepaliveThresholdBytes: number;
  private readonly fetchImpl: typeof fetch;
  private readonly emitter: Emitter<UploaderEvents> = defineEmitter();
  private readonly queue: QueueEntry[] = [];
  private queuedBytes = 0;
  private totalAckedBytes = 0;
  private inFlight = false;
  private currentState: UploaderState = "idle";

  constructor(opts: UploaderOptions) {
    this.url = opts.url;
    this.headers = opts.headers ?? {};
    this.maxQueuedBytes = opts.maxQueuedBytes ?? DEFAULT_MAX_QUEUED_BYTES;
    this.keepaliveThresholdBytes =
      opts.keepaliveThresholdBytes ?? DEFAULT_KEEPALIVE_THRESHOLD_BYTES;
    this.fetchImpl = opts.fetchImpl ?? globalThis.fetch.bind(globalThis);
  }

  get state(): UploaderState {
    return this.currentState;
  }

  get pendingBytes(): number {
    return this.queuedBytes;
  }

  on<E extends keyof UploaderEvents>(
    event: E,
    handler: (payload: UploaderEvents[E]) => void,
  ): () => void {
    return this.emitter.on(event, handler);
  }

  async send(chunk: Blob): Promise<void> {
    if (this.currentState === "closed") {
      throw new SdkError("Uploader is closed", { code: "uploader_closed" });
    }
    if (this.queuedBytes + chunk.size > this.maxQueuedBytes) {
      const err = new SdkError(
        `Uploader queue would exceed maxQueuedBytes=${this.maxQueuedBytes}`,
        { code: "uploader_queue_overflow" },
      );
      this.emitter.emit("error", err);
      throw err;
    }
    this.queue.push({ blob: chunk, bytes: chunk.size });
    this.queuedBytes += chunk.size;
    void this.pump();
  }

  async retry(): Promise<void> {
    if (this.currentState !== "failed") return;
    this.setState("idle");
    await this.pump();
  }

  close(): void {
    this.queue.length = 0;
    this.queuedBytes = 0;
    this.setState("closed");
  }

  /** Drain the queue one chunk at a time, halting on first failure. */
  private async pump(): Promise<void> {
    if (this.inFlight) return;
    if (this.currentState === "failed" || this.currentState === "closed") return;
    const next = this.queue[0];
    if (next === undefined) {
      this.setState("idle");
      return;
    }
    this.inFlight = true;
    this.setState("uploading");
    try {
      const init: RequestInit = {
        method: "POST",
        headers: this.buildHeaders(next.blob),
        body: next.blob,
      };
      if (next.bytes <= this.keepaliveThresholdBytes) {
        init.keepalive = true;
      }
      const response = await this.fetchImpl(this.url, init);
      if (!response.ok) {
        throw new SdkError(`Uploader: HTTP ${response.status} ${response.statusText}`, {
          code: "uploader_http_error",
        });
      }
      this.queue.shift();
      this.queuedBytes -= next.bytes;
      this.totalAckedBytes += next.bytes;
      this.emitter.emit("ack", { bytes: next.bytes, totalBytes: this.totalAckedBytes });
    } catch (cause) {
      const err =
        cause instanceof SdkError
          ? cause
          : new SdkError("Uploader: send failed", {
              code: "uploader_send_failed",
              cause,
            });
      this.setState("failed");
      this.emitter.emit("error", err);
      this.inFlight = false;
      return;
    }
    this.inFlight = false;
    void this.pump();
  }

  private buildHeaders(chunk: Blob): Headers {
    const headers = new Headers(this.headers);
    if (!headers.has("Content-Type") && chunk.type !== "") {
      headers.set("Content-Type", chunk.type);
    }
    return headers;
  }

  private setState(next: UploaderState): void {
    if (this.currentState === next) return;
    this.currentState = next;
    this.emitter.emit("state", next);
  }
}

/**
 * Build an HTTP-POST-per-chunk upload sink. Pair with `recorder.pipeTo(uploader)`
 * to stream a `MediaRecorder` to a server.
 */
export function defineUploader(opts: UploaderOptions): Uploader {
  return new HttpUploader(opts);
}
