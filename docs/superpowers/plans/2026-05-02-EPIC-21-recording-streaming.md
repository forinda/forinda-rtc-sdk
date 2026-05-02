# EPIC-21 Recording Streaming + Declarative Element Wiring Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `Recorder` useful for live-upload scenarios via a `defineUploader` sink + `recorder.pipeTo(uploader)` pump, and remove the JS-only stream-binding requirement on `<forinda-recorder>` via a `for=` attribute and a slottable `<forinda-uploader>` element.

**Architecture:**

- **Sink contract (`Uploader`)**: a tiny interface — `send(chunk: Blob): Promise<void>` (resolves on 2xx, rejects on 4xx/5xx) + `state: "idle" | "uploading" | "paused" | "failed"` + `state` event + `pendingBytes` getter + `retry()` + `close()`.
- **`defineUploader({ url, headers?, maxQueuedBytes?, fetchImpl? })`**: builds an HTTP-`POST`-per-chunk uploader. Uses `fetch` with `keepalive: true` for chunks ≤ 60 KiB (under the spec's 64 KiB keepalive limit), regular `fetch` otherwise. Internal FIFO queue capped by `maxQueuedBytes`. On HTTP failure → `state` flips to `failed`, queue paused, error surfaced via the `error` event; consumer drives recovery with `uploader.retry()`.
- **`recorder.pipeTo(uploader)`**: subscribes to the recorder's `dataavailable` event, hands every chunk to `uploader.send`. On uploader `failed` → `recorder.pause()`. On uploader `idle` after a successful retry → `recorder.resume()`. Returns a disposer (so consumers can `pipeTo` once and unwire later).
- **`<forinda-recorder for="x">`**: at `start()`, looks up `document.getElementById("x")`, snapshots its `mediaStream` property, records that stream. Stream changes during recording are not auto-followed (matches MediaRecorder semantics — call `restart()` to pick up a new stream).
- **`<forinda-uploader url="…" headers="…">`**: slottable inside `<forinda-recorder>`. The recorder element queries its slotted `<forinda-uploader>` children at `start()` and pipes the recorder to each. Multiple uploaders allowed (fan-out).
- **Adapter helpers**: `useUploader(recorder, uploader)` for React + Vue. Wires `pipeTo` inside the effect/scope, exposes `{ state, pendingBytes, error, retry }`.

**Tech Stack:** TypeScript, Vitest (jsdom), `@forinda/test-helpers`, `@vue/test-utils`, native `fetch` (mocked in tests).

---

## File structure

| File                                                                                                                 | Responsibility                                                                                                                                                                                        |
| -------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/core/src/recording/uploader-types.ts`                                                                      | `Uploader`, `UploaderState`, `UploaderEvents`, `UploaderOptions` interfaces.                                                                                                                          |
| `packages/core/src/recording/uploader.ts`                                                                            | `defineUploader(opts)` — HTTP-POST-per-chunk implementation with queue + keepalive heuristic.                                                                                                         |
| `packages/core/src/recording/pipe.ts`                                                                                | `pipeRecorderTo(recorder, uploader)` — wires `dataavailable` → `uploader.send` and uploader state → recorder pause/resume.                                                                            |
| `packages/core/src/recording/recorder.ts`                                                                            | Add `pipeTo(uploader)` instance method (thin wrapper over `pipeRecorderTo`).                                                                                                                          |
| `packages/core/src/index.ts`                                                                                         | Re-export `defineUploader`, `pipeRecorderTo`, types.                                                                                                                                                  |
| `packages/core/test/unit/recording/uploader.test.ts`                                                                 | Chunk → fetch round-trip, queue-cap, keepalive heuristic, retry resume, headers.                                                                                                                      |
| `packages/core/test/unit/recording/pipe.test.ts`                                                                     | Pump wires events, fail → pause, retry → resume.                                                                                                                                                      |
| `packages/web-components/src/elements/recorder.ts`                                                                   | Add `for=` attribute support; query slotted `<forinda-uploader>` children at start; pipe to each.                                                                                                     |
| `packages/web-components/src/elements/uploader.ts`                                                                   | New `<forinda-uploader>` element. Reads `url`, `headers`, `max-queued-bytes` attributes; constructs a `defineUploader` lazily on first access; exposes `uploader` getter for the recorder to consume. |
| `packages/web-components/src/elements/register.ts`                                                                   | Register `ForindaUploader`.                                                                                                                                                                           |
| `packages/web-components/test/unit/recorder.test.ts`                                                                 | New tests for `for=` resolution + slotted uploader pipe wiring.                                                                                                                                       |
| `packages/web-components/test/unit/uploader.test.ts`                                                                 | New: attribute reading, headers parsing, queue cap surfacing.                                                                                                                                         |
| `packages/react/src/use-uploader.ts`                                                                                 | `useUploader(recorder, uploader)` returning reactive `{ state, pendingBytes, error, retry }`.                                                                                                         |
| `packages/react/src/index.ts`                                                                                        | Re-export.                                                                                                                                                                                            |
| `packages/react/test/unit/use-uploader.test.tsx`                                                                     | New.                                                                                                                                                                                                  |
| `packages/vue/src/use-uploader.ts`                                                                                   | Vue-flavored equivalent.                                                                                                                                                                              |
| `packages/vue/src/index.ts`                                                                                          | Re-export.                                                                                                                                                                                            |
| `packages/vue/test/unit/use-uploader.test.ts`                                                                        | New.                                                                                                                                                                                                  |
| `packages/core/README.md`, `packages/web-components/README.md`, `packages/react/README.md`, `packages/vue/README.md` | Document the new uploader surface and `for=` shorthand.                                                                                                                                               |
| `.changeset/recording-streaming.md`                                                                                  | minor for `core`, `elements`; patch for `react`, `vue`, peer-dep cascades.                                                                                                                            |

---

## Task 1: Uploader interface + types

**Files:**

- Create: `packages/core/src/recording/uploader-types.ts`

- [ ] **Step 1: Create the types file**

```ts
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
```

- [ ] **Step 2: Run typecheck to verify it compiles**

```bash
pnpm --filter @forinda/video-sdk-core typecheck
```

Expected: green.

- [ ] **Step 3: Commit**

```bash
git add packages/core/src/recording/uploader-types.ts
git commit -m "feat(core): Uploader interface + UploaderOptions (EPIC-21 #1/10)"
```

---

## Task 2: `defineUploader` — HTTP POST-per-chunk implementation

**Files:**

- Create: `packages/core/src/recording/uploader.ts`
- Test: `packages/core/test/unit/recording/uploader.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/core/test/unit/recording/uploader.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defineUploader } from "@/recording/uploader.ts";
import type { UploaderState } from "@/recording/uploader-types.ts";

function blob(size: number, type = "video/webm"): Blob {
  // Build a real Blob the size we asked for.
  const bytes = new Uint8Array(size);
  return new Blob([bytes], { type });
}

describe("defineUploader — happy path", () => {
  let fetchImpl: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    fetchImpl = vi.fn(async () => new Response("ok", { status: 200 }));
  });

  it("POSTs each chunk to the configured url", async () => {
    const u = defineUploader({ url: "https://example.test/upload", fetchImpl });
    await u.send(blob(100));
    await u.send(blob(200));

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    const [firstUrl, firstInit] = fetchImpl.mock.calls[0]!;
    expect(firstUrl).toBe("https://example.test/upload");
    expect((firstInit as RequestInit).method).toBe("POST");
  });

  it("forwards configured headers and the chunk's mime type", async () => {
    const u = defineUploader({
      url: "https://example.test/upload",
      headers: { Authorization: "Bearer t" },
      fetchImpl,
    });
    await u.send(blob(100, "video/mp4"));

    const init = fetchImpl.mock.calls[0]![1] as RequestInit;
    const headers = new Headers(init.headers);
    expect(headers.get("Authorization")).toBe("Bearer t");
    expect(headers.get("Content-Type")).toBe("video/mp4");
  });

  it("uses keepalive for chunks at or below the threshold", async () => {
    const u = defineUploader({
      url: "https://example.test/upload",
      keepaliveThresholdBytes: 100,
      fetchImpl,
    });
    await u.send(blob(80));
    await u.send(blob(200));

    const initSmall = fetchImpl.mock.calls[0]![1] as RequestInit;
    const initLarge = fetchImpl.mock.calls[1]![1] as RequestInit;
    expect(initSmall.keepalive).toBe(true);
    expect(initLarge.keepalive).not.toBe(true);
  });

  it("emits ack with cumulative totals", async () => {
    const u = defineUploader({ url: "https://example.test/upload", fetchImpl });
    const acks: Array<{ bytes: number; totalBytes: number }> = [];
    u.on("ack", (e) => acks.push(e));

    await u.send(blob(100));
    await u.send(blob(50));

    expect(acks).toEqual([
      { bytes: 100, totalBytes: 100 },
      { bytes: 50, totalBytes: 150 },
    ]);
  });
});

describe("defineUploader — failure + recovery", () => {
  it("flips to failed on HTTP 5xx and emits error", async () => {
    const fetchImpl = vi.fn(async () => new Response("nope", { status: 503 }));
    const u = defineUploader({ url: "https://example.test/upload", fetchImpl });

    const states: UploaderState[] = [];
    const errors: Error[] = [];
    u.on("state", (s) => states.push(s));
    u.on("error", (e) => errors.push(e));

    await u.send(blob(100)).catch(() => {});
    expect(u.state).toBe("failed");
    expect(states).toContain("failed");
    expect(errors[0]?.message).toMatch(/503/);
  });

  it("retry() resends the queued chunk after a transient failure", async () => {
    let attempts = 0;
    const fetchImpl = vi.fn(async () => {
      attempts += 1;
      if (attempts === 1) return new Response("nope", { status: 500 });
      return new Response("ok", { status: 200 });
    });
    const u = defineUploader({ url: "https://example.test/upload", fetchImpl });

    await u.send(blob(100)).catch(() => {});
    expect(u.state).toBe("failed");

    await u.retry();

    expect(u.state).toBe("idle");
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("rejects send when maxQueuedBytes would be exceeded", async () => {
    // Block delivery so the queue actually accumulates.
    let resolveFetch: ((r: Response) => void) | undefined;
    const fetchImpl = vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          resolveFetch = resolve;
        }),
    );
    const u = defineUploader({
      url: "https://example.test/upload",
      maxQueuedBytes: 200,
      fetchImpl,
    });

    void u.send(blob(150));
    // Second chunk exceeds the cap (150 in-flight + 100 queued > 200).
    await expect(u.send(blob(100))).rejects.toMatchObject({
      code: "uploader_queue_overflow",
    });
    resolveFetch?.(new Response("ok", { status: 200 }));
  });
});

describe("defineUploader — close", () => {
  it("rejects subsequent sends after close()", async () => {
    const fetchImpl = vi.fn(async () => new Response("ok", { status: 200 }));
    const u = defineUploader({ url: "https://example.test/upload", fetchImpl });
    u.close();
    expect(u.state).toBe("closed");
    await expect(u.send(blob(10))).rejects.toMatchObject({ code: "uploader_closed" });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
pnpm --filter @forinda/video-sdk-core test -- recording/uploader
```

Expected: failures — `defineUploader` doesn't exist.

- [ ] **Step 3: Implement `defineUploader`**

Create `packages/core/src/recording/uploader.ts`:

```ts
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
```

- [ ] **Step 4: Re-run the test**

```bash
pnpm --filter @forinda/video-sdk-core test -- recording/uploader
```

Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/recording/uploader.ts packages/core/src/recording/uploader-types.ts packages/core/test/unit/recording/uploader.test.ts
git commit -m "feat(core): defineUploader with queue + keepalive heuristic (EPIC-21 #2/10)"
```

---

## Task 3: `pipeRecorderTo` + `recorder.pipeTo()` method

**Files:**

- Create: `packages/core/src/recording/pipe.ts`
- Modify: `packages/core/src/recording/recorder.ts`
- Modify: `packages/core/src/index.ts`
- Test: `packages/core/test/unit/recording/pipe.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/core/test/unit/recording/pipe.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defineRecorder } from "@/recording/recorder.ts";
import { pipeRecorderTo } from "@/recording/pipe.ts";
import { defineUploader } from "@/recording/uploader.ts";
import { installFakeMediaRecorder, type InstalledFakeRecorder } from "@forinda/test-helpers";

let fx: InstalledFakeRecorder;

beforeEach(() => {
  fx = installFakeMediaRecorder();
});
afterEach(() => fx.cleanup());

const fakeStream = (): MediaStream => ({}) as unknown as MediaStream;

describe("pipeRecorderTo", () => {
  it("forwards every dataavailable chunk to the uploader", async () => {
    const fetchImpl = vi.fn(async () => new Response("ok", { status: 200 }));
    const uploader = defineUploader({ url: "https://t/u", fetchImpl });
    const recorder = defineRecorder(fakeStream());

    pipeRecorderTo(recorder, uploader);
    recorder.start();

    fx.current?.__fire("dataavailable", { data: new Blob(["a"]) });
    fx.current?.__fire("dataavailable", { data: new Blob(["bb"]) });

    // Allow the uploader's async pump to drain.
    await Promise.resolve();
    await Promise.resolve();

    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("pauses the recorder when the uploader fails", async () => {
    const fetchImpl = vi.fn(async () => new Response("nope", { status: 500 }));
    const uploader = defineUploader({ url: "https://t/u", fetchImpl });
    const recorder = defineRecorder(fakeStream());

    pipeRecorderTo(recorder, uploader);
    recorder.start();

    const pauseSpy = fx.current!.pause as ReturnType<typeof vi.fn>;

    fx.current?.__fire("dataavailable", { data: new Blob(["x"]) });
    await Promise.resolve();
    await Promise.resolve();

    expect(uploader.state).toBe("failed");
    expect(pauseSpy).toHaveBeenCalled();
  });

  it("resumes the recorder when the uploader recovers via retry()", async () => {
    let attempts = 0;
    const fetchImpl = vi.fn(async () => {
      attempts += 1;
      return attempts === 1
        ? new Response("nope", { status: 500 })
        : new Response("ok", { status: 200 });
    });
    const uploader = defineUploader({ url: "https://t/u", fetchImpl });
    const recorder = defineRecorder(fakeStream());

    pipeRecorderTo(recorder, uploader);
    recorder.start();

    const resumeSpy = fx.current!.resume as ReturnType<typeof vi.fn>;

    fx.current?.__fire("dataavailable", { data: new Blob(["x"]) });
    await Promise.resolve();
    await Promise.resolve();
    expect(uploader.state).toBe("failed");

    await uploader.retry();

    expect(resumeSpy).toHaveBeenCalled();
  });

  it("the disposer unwires the pump", async () => {
    const fetchImpl = vi.fn(async () => new Response("ok", { status: 200 }));
    const uploader = defineUploader({ url: "https://t/u", fetchImpl });
    const recorder = defineRecorder(fakeStream());

    const dispose = pipeRecorderTo(recorder, uploader);
    recorder.start();

    fx.current?.__fire("dataavailable", { data: new Blob(["a"]) });
    await Promise.resolve();
    expect(fetchImpl).toHaveBeenCalledTimes(1);

    dispose();
    fx.current?.__fire("dataavailable", { data: new Blob(["b"]) });
    await Promise.resolve();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});

describe("Recorder.pipeTo", () => {
  it("returns the same disposer as pipeRecorderTo", async () => {
    const fetchImpl = vi.fn(async () => new Response("ok", { status: 200 }));
    const uploader = defineUploader({ url: "https://t/u", fetchImpl });
    const recorder = defineRecorder(fakeStream());

    const dispose = recorder.pipeTo(uploader);
    expect(typeof dispose).toBe("function");

    recorder.start();
    fx.current?.__fire("dataavailable", { data: new Blob(["a"]) });
    await Promise.resolve();
    expect(fetchImpl).toHaveBeenCalledTimes(1);

    dispose();
    fx.current?.__fire("dataavailable", { data: new Blob(["b"]) });
    await Promise.resolve();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
pnpm --filter @forinda/video-sdk-core test -- recording/pipe
```

Expected: failures — `pipeRecorderTo` and `recorder.pipeTo` don't exist.

- [ ] **Step 3: Create `pipe.ts`**

Create `packages/core/src/recording/pipe.ts`:

```ts
/**
 * `pipeRecorderTo` — wire a `Recorder` into an `Uploader`.
 *
 * Subscribes to `dataavailable` and hands every chunk to `uploader.send`.
 * On `uploader` `failed` → calls `recorder.pause()`. On `uploader` `idle`
 * after recovery → calls `recorder.resume()`. Returns a disposer that
 * unsubscribes both directions; pairs naturally with React's effect
 * cleanup or Vue's `onScopeDispose`.
 */

import type { Recorder } from "./recorder.ts";
import type { Uploader } from "./uploader-types.ts";

export function pipeRecorderTo(recorder: Recorder, uploader: Uploader): () => void {
  const offData = recorder.on("dataavailable", ({ data }) => {
    void uploader.send(data).catch(() => {
      // The uploader's own error event already surfaces this; the
      // recorder.pause below is driven by the state listener.
    });
  });

  const offState = uploader.on("state", (s) => {
    if (s === "failed" && (recorder.state === "recording" || recorder.state === "paused")) {
      // Pause so the underlying MediaRecorder doesn't keep producing chunks
      // we can't deliver. Keep already-buffered chunks for the retry.
      if (recorder.state === "recording") recorder.pause();
    } else if (s === "idle" && recorder.state === "paused") {
      recorder.resume();
    }
  });

  return () => {
    offData();
    offState();
  };
}
```

- [ ] **Step 4: Add `pipeTo` to the `Recorder` class**

In `packages/core/src/recording/recorder.ts`:

4a. Add to the existing imports at the top of the file (after the existing core imports):

```ts
import { pipeRecorderTo } from "./pipe.ts";
import type { Uploader } from "./uploader-types.ts";
```

4b. Add a method to the class, immediately after the existing `resume(): void { ... }`:

```ts
/**
 * Forward every `dataavailable` chunk to an `Uploader`. The uploader's
 * `failed` state pauses this recorder; recovery (via `uploader.retry()`)
 * resumes it. Returns a disposer to unwire — pairs naturally with React's
 * effect cleanup or Vue's `onScopeDispose`.
 */
pipeTo(uploader: Uploader): () => void {
  return pipeRecorderTo(this, uploader);
}
```

- [ ] **Step 5: Re-export from `core/src/index.ts`**

In `packages/core/src/index.ts`, after the existing `// Recording — MediaRecorder wrapper` block, append:

```ts
export { defineUploader } from "./recording/uploader.ts";
export { pipeRecorderTo } from "./recording/pipe.ts";
export type {
  Uploader,
  UploaderEvents,
  UploaderOptions,
  UploaderState,
} from "./recording/uploader-types.ts";
```

- [ ] **Step 6: Re-run the pipe tests**

```bash
pnpm --filter @forinda/video-sdk-core test -- recording/pipe
```

Expected: all pass.

- [ ] **Step 7: Run the full core suite**

```bash
pnpm --filter @forinda/video-sdk-core test
```

Expected: green.

- [ ] **Step 8: Commit**

```bash
git add packages/core/src/recording/pipe.ts packages/core/src/recording/recorder.ts packages/core/src/index.ts packages/core/test/unit/recording/pipe.test.ts
git commit -m "feat(core): pipeRecorderTo + Recorder.pipeTo with backpressure (EPIC-21 #3/10)"
```

---

## Task 4: `<forinda-uploader>` element

**Files:**

- Create: `packages/web-components/src/elements/uploader.ts`
- Modify: `packages/web-components/src/elements/register.ts`
- Test: `packages/web-components/test/unit/uploader.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/web-components/test/unit/uploader.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ForindaUploader } from "@/elements/uploader.ts";
import { registerAll } from "@/elements/register.ts";

beforeEach(() => {
  registerAll();
});
afterEach(() => {
  while (document.body.firstChild) document.body.removeChild(document.body.firstChild);
});

function mountUploader(attrs: Record<string, string>): ForindaUploader {
  const el = document.createElement("forinda-uploader") as ForindaUploader;
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  document.body.appendChild(el);
  return el;
}

describe("<forinda-uploader>", () => {
  it("registers the custom element", () => {
    expect(customElements.get("forinda-uploader")).toBe(ForindaUploader);
  });

  it("reads url + headers attributes and exposes an uploader", async () => {
    const fetchImpl = vi.fn(async () => new Response("ok", { status: 200 }));
    const el = mountUploader({
      url: "https://example.test/u",
      headers: '{"Authorization":"Bearer abc"}',
    });
    el.fetchImpl = fetchImpl;

    const uploader = el.uploader;
    expect(uploader).not.toBeNull();
    await uploader!.send(new Blob(["x"], { type: "application/octet-stream" }));

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const init = fetchImpl.mock.calls[0]![1] as RequestInit;
    expect(new Headers(init.headers).get("Authorization")).toBe("Bearer abc");
  });

  it("returns null from .uploader before a url is set", () => {
    const el = mountUploader({});
    expect(el.uploader).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
pnpm --filter @forinda/video-sdk-elements test -- uploader
```

Expected: failures — `ForindaUploader` doesn't exist.

- [ ] **Step 3: Implement the element**

Create `packages/web-components/src/elements/uploader.ts`:

````ts
/**
 * `<forinda-uploader>` — declarative companion to `<forinda-recorder>`.
 *
 * Reads `url`, `headers` (JSON), `max-queued-bytes`, and `keepalive-threshold`
 * attributes. Exposes a lazily-built `Uploader` via the `.uploader` getter
 * — the recorder element queries slotted `<forinda-uploader>` children at
 * `start()` and pipes each chunk to them.
 *
 * Headers parse failures fall back silently to no headers (with a
 * `console.warn` to flag the malformed JSON).
 *
 * @example
 * ```html
 * <forinda-recorder for="my-publisher">
 *   <forinda-uploader url="/api/uploads" headers='{"Authorization":"Bearer t"}'></forinda-uploader>
 * </forinda-recorder>
 * ```
 */

import { defineUploader, type Uploader } from "@forinda/video-sdk-core";
import { readNumber, readString } from "@/internal/attrs.ts";

export class ForindaUploader extends HTMLElement {
  static readonly tagName = "forinda-uploader";

  private uploaderInstance: Uploader | null = null;
  /** Test seam — replaces the global `fetch` for this instance. */
  fetchImpl?: typeof fetch;

  /** Lazily built `Uploader`, returns `null` when no `url` attribute is set. */
  get uploader(): Uploader | null {
    if (this.uploaderInstance !== null) return this.uploaderInstance;
    const url = readString(this, "url");
    if (url === null) return null;
    const headers = this.parseHeaders();
    const maxQueuedBytes = readNumber(this, "max-queued-bytes", 0);
    const keepaliveThreshold = readNumber(this, "keepalive-threshold", 0);
    this.uploaderInstance = defineUploader({
      url,
      ...(headers !== null ? { headers } : {}),
      ...(maxQueuedBytes > 0 ? { maxQueuedBytes } : {}),
      ...(keepaliveThreshold > 0 ? { keepaliveThresholdBytes: keepaliveThreshold } : {}),
      ...(this.fetchImpl !== undefined ? { fetchImpl: this.fetchImpl } : {}),
    });
    return this.uploaderInstance;
  }

  disconnectedCallback(): void {
    this.uploaderInstance?.close();
    this.uploaderInstance = null;
  }

  private parseHeaders(): Record<string, string> | null {
    const raw = readString(this, "headers");
    if (raw === null) return null;
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) return null;
      const out: Record<string, string> = {};
      for (const [k, v] of Object.entries(parsed)) {
        if (typeof v === "string") out[k] = v;
      }
      return out;
    } catch {
      // Soft-fail on bad JSON — surface a console warning so devs notice.
      // eslint-disable-next-line no-console
      console.warn("forinda-uploader: failed to parse `headers` attribute as JSON");
      return null;
    }
  }
}
````

- [ ] **Step 4: Register the element**

Open `packages/web-components/src/elements/register.ts` and add `ForindaUploader` to the registration list. The existing file imports the other classes and lists them in an array; add the new import and list entry mirroring the existing pattern:

```ts
import { ForindaUploader } from "./uploader.ts";
```

And add `ForindaUploader` to the `ELEMENTS` (or equivalent) array.

- [ ] **Step 5: Re-run the element test**

```bash
pnpm --filter @forinda/video-sdk-elements test -- uploader
```

Expected: all pass.

- [ ] **Step 6: Run the elements suite**

```bash
pnpm --filter @forinda/video-sdk-elements test
```

Expected: green.

- [ ] **Step 7: Commit**

```bash
git add packages/web-components/src/elements/uploader.ts packages/web-components/src/elements/register.ts packages/web-components/test/unit/uploader.test.ts
git commit -m "feat(elements): <forinda-uploader> declarative upload sink (EPIC-21 #4/10)"
```

---

## Task 5: `<forinda-recorder for=…>` + slotted uploader pipe

**Files:**

- Modify: `packages/web-components/src/elements/recorder.ts`
- Test: `packages/web-components/test/unit/recorder.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `packages/web-components/test/unit/recorder.test.ts`. First, ensure the file imports `ForindaUploader` and the `installFakeMediaRecorder` fixture (if it doesn't already — check the existing imports). Add to the imports:

```ts
import { ForindaUploader } from "@/elements/uploader.ts";
import { installFakeMediaRecorder, type InstalledFakeRecorder } from "@forinda/test-helpers";
```

Then either confirm the existing `beforeEach` already wires `installFakeMediaRecorder`, or add the standard pair (mirroring `packages/core/test/unit/recording/recorder.test.ts`):

```ts
let fx: InstalledFakeRecorder;
beforeEach(() => {
  fx = installFakeMediaRecorder();
});
afterEach(() => fx.cleanup());
```

Append the new describe block:

```ts
describe("<forinda-recorder> — for= + slotted uploader (EPIC-21)", () => {
  function mount(html: { for?: string; slotted?: { url: string } } = {}): ForindaRecorder {
    const el = document.createElement("forinda-recorder") as ForindaRecorder;
    if (html.for !== undefined) el.setAttribute("for", html.for);
    if (html.slotted !== undefined) {
      const u = document.createElement("forinda-uploader");
      u.setAttribute("url", html.slotted.url);
      el.appendChild(u);
    }
    document.body.appendChild(el);
    return el;
  }

  it("snapshots the target's mediaStream at start() time when for= is set", () => {
    const target = document.createElement("div") as HTMLDivElement & {
      mediaStream?: MediaStream;
    };
    target.id = "src";
    const fakeStream = { id: "fake" } as unknown as MediaStream;
    target.mediaStream = fakeStream;
    document.body.appendChild(target);

    const el = mount({ for: "src" });
    el.start();

    expect(el.stream).toBe(fakeStream);
  });

  it("emits an error when for= references a missing element", () => {
    const el = mount({ for: "ghost" });
    const errors: Error[] = [];
    el.addEventListener("recorder-error", (e) => errors.push((e as CustomEvent<Error>).detail));
    el.start();
    expect(errors[0]?.message).toMatch(/for="ghost"/);
  });

  it("emits an error when the for= target lacks a mediaStream property", () => {
    const target = document.createElement("div");
    target.id = "bad";
    document.body.appendChild(target);

    const el = mount({ for: "bad" });
    const errors: Error[] = [];
    el.addEventListener("recorder-error", (e) => errors.push((e as CustomEvent<Error>).detail));
    el.start();
    expect(errors[0]?.message).toMatch(/mediaStream/);
  });

  it("pipes to slotted <forinda-uploader> children when started", async () => {
    const fetchImpl = vi.fn(async () => new Response("ok", { status: 200 }));
    const recorderEl = mount({ slotted: { url: "https://t/u" } });
    const uploaderEl = recorderEl.querySelector("forinda-uploader") as ForindaUploader;
    uploaderEl.fetchImpl = fetchImpl;
    recorderEl.stream = { id: "src" } as unknown as MediaStream;
    recorderEl.start();

    fx.current?.__fire("dataavailable", { data: new Blob(["x"]) });
    await Promise.resolve();
    await Promise.resolve();

    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
pnpm --filter @forinda/video-sdk-elements test -- recorder
```

Expected: 4 new failures — `for=` and slotted-uploader behavior aren't implemented yet.

- [ ] **Step 3: Implement `for=` resolution + slotted uploader pipe**

In `packages/web-components/src/elements/recorder.ts`:

3a. Update the imports at the top to include `pipeRecorderTo` and `ForindaUploader`. Replace the existing import block:

```ts
import {
  defineRecorder,
  pipeRecorderTo,
  type Recorder,
  type RecorderOptions,
  type RecorderState,
} from "@forinda/video-sdk-core";
import { ForindaUploader } from "./uploader.ts";
import { readNumber, readString } from "@/internal/attrs.ts";
import { dispatchTypedEvent } from "@/internal/send-event.ts";
```

3b. Add a private field for the pipe disposers near the other private fields:

```ts
private pipeDisposers: Array<() => void> = [];
```

3c. Replace the body of `start()` with one that consults the `for=` attribute first, then wires every slotted `<forinda-uploader>`:

```ts
start(): void {
  if (this.streamRef === null) {
    const forId = readString(this, "for");
    if (forId !== null) {
      const target = document.getElementById(forId) as
        | (Element & { mediaStream?: MediaStream | null })
        | null;
      if (target === null) {
        this.emitError(new Error(`forinda-recorder: for="${forId}" target not found`));
        return;
      }
      const stream = target.mediaStream ?? null;
      if (stream === null) {
        this.emitError(
          new Error(
            `forinda-recorder: for="${forId}" target has no mediaStream property; set one before start()`,
          ),
        );
        return;
      }
      this.streamRef = stream;
    }
  }

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

  // Wire any slotted <forinda-uploader> children. Multiple are allowed —
  // each gets its own pipe so consumers can fan out to redundant backends.
  for (const child of this.querySelectorAll<ForindaUploader>("forinda-uploader")) {
    const sink = child.uploader;
    if (sink === null) continue;
    this.pipeDisposers.push(pipeRecorderTo(r, sink));
  }

  try {
    r.start();
  } catch (err) {
    this.emitError(err);
    this.recorder = null;
  }
}
```

3d. In `disconnectedCallback`, dispose pipe wires before nulling the recorder:

```ts
disconnectedCallback(): void {
  for (const dispose of this.pipeDisposers) dispose();
  this.pipeDisposers = [];
  if (this.recorder?.state === "recording" || this.recorder?.state === "paused") {
    void this.recorder.stop();
  }
  this.recorder = null;
}
```

3e. In the manual `stop()` method, also dispose pipes (so a stop+start cycle doesn't double-wire):

```ts
async stop(): Promise<Blob | null> {
  if (this.recorder === null) return null;
  for (const dispose of this.pipeDisposers) dispose();
  this.pipeDisposers = [];
  return this.recorder.stop();
}
```

- [ ] **Step 4: Re-run the recorder test**

```bash
pnpm --filter @forinda/video-sdk-elements test -- recorder
```

Expected: all pass.

- [ ] **Step 5: Run the elements suite**

```bash
pnpm --filter @forinda/video-sdk-elements test
```

Expected: green.

- [ ] **Step 6: Commit**

```bash
git add packages/web-components/src/elements/recorder.ts packages/web-components/test/unit/recorder.test.ts
git commit -m "feat(elements): <forinda-recorder for=> + slotted <forinda-uploader> pipe (EPIC-21 #5/10)"
```

---

## Task 6: React `useUploader`

**Files:**

- Create: `packages/react/src/use-uploader.ts`
- Modify: `packages/react/src/index.ts`
- Test: `packages/react/test/unit/use-uploader.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `packages/react/test/unit/use-uploader.test.tsx`:

```tsx
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defineRecorder, defineUploader } from "@forinda/video-sdk-core";
import { installFakeMediaRecorder, type InstalledFakeRecorder } from "@forinda/test-helpers";
import { useUploader } from "@/use-uploader.ts";

let fx: InstalledFakeRecorder;
beforeEach(() => {
  fx = installFakeMediaRecorder();
});
afterEach(() => fx.cleanup());

const fakeStream = (): MediaStream => ({}) as unknown as MediaStream;

describe("useUploader", () => {
  it("wires the recorder to the uploader and surfaces idle/uploading state", async () => {
    const fetchImpl = vi.fn(async () => new Response("ok", { status: 200 }));
    const uploader = defineUploader({ url: "https://t/u", fetchImpl });
    const recorder = defineRecorder(fakeStream());

    const { result } = renderHook(() => useUploader(recorder, uploader));

    expect(result.current.state).toBe("idle");
    recorder.start();

    await act(async () => {
      fx.current?.__fire("dataavailable", { data: new Blob(["x"]) });
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("retry() proxies to the uploader", async () => {
    let attempts = 0;
    const fetchImpl = vi.fn(async () => {
      attempts += 1;
      return attempts === 1
        ? new Response("nope", { status: 500 })
        : new Response("ok", { status: 200 });
    });
    const uploader = defineUploader({ url: "https://t/u", fetchImpl });
    const recorder = defineRecorder(fakeStream());

    const { result } = renderHook(() => useUploader(recorder, uploader));

    recorder.start();
    fx.current?.__fire("dataavailable", { data: new Blob(["x"]) });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(result.current.state).toBe("failed");

    await act(async () => {
      await result.current.retry();
    });
    expect(result.current.state).toBe("idle");
  });

  it("returns inert state when recorder or uploader is null", () => {
    const { result } = renderHook(() => useUploader(null, null));
    expect(result.current.state).toBe("idle");
    expect(result.current.pendingBytes).toBe(0);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
pnpm --filter @forinda/video-sdk-react test -- use-uploader
```

Expected: failures — hook doesn't exist.

- [ ] **Step 3: Implement the hook**

Create `packages/react/src/use-uploader.ts`:

```ts
/**
 * `useUploader` — wire a `Recorder` to an `Uploader` for the lifetime of
 * the calling component. Returns reactive state for "Uploading…" /
 * "Failed (retry?)" UI.
 *
 * SSR-safe: returns inert state on the server.
 */

import { useCallback, useEffect, useState } from "react";
import {
  pipeRecorderTo,
  type Recorder,
  type Uploader,
  type UploaderState,
} from "@forinda/video-sdk-core";
import { isServer } from "./internal/ssr.ts";

export interface UseUploaderResult {
  state: UploaderState;
  pendingBytes: number;
  error: Error | null;
  /** Resume after a `failed` state. No-op if the uploader is already healthy. */
  retry: () => Promise<void>;
}

export function useUploader(
  recorder: Recorder | null,
  uploader: Uploader | null,
): UseUploaderResult {
  const [state, setState] = useState<UploaderState>(uploader?.state ?? "idle");
  const [pendingBytes, setPendingBytes] = useState<number>(uploader?.pendingBytes ?? 0);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (isServer || recorder === null || uploader === null) return;

    const ctrl = new AbortController();
    const dispose = pipeRecorderTo(recorder, uploader);

    const offState = uploader.on("state", (s) => {
      if (ctrl.signal.aborted) return;
      setState(s);
      setPendingBytes(uploader.pendingBytes);
    });
    const offAck = uploader.on("ack", () => {
      if (ctrl.signal.aborted) return;
      setPendingBytes(uploader.pendingBytes);
    });
    const offError = uploader.on("error", (e) => {
      if (ctrl.signal.aborted) return;
      setError(e);
    });

    return () => {
      ctrl.abort();
      offState();
      offAck();
      offError();
      dispose();
    };
  }, [recorder, uploader]);

  const retry = useCallback(async (): Promise<void> => {
    if (uploader !== null) await uploader.retry();
  }, [uploader]);

  return { state, pendingBytes, error, retry };
}
```

- [ ] **Step 4: Re-export from `packages/react/src/index.ts`**

Append to the existing exports:

```ts
export { useUploader, type UseUploaderResult } from "./use-uploader.ts";
```

- [ ] **Step 5: Re-run the React test**

```bash
pnpm --filter @forinda/video-sdk-react test
```

Expected: green.

- [ ] **Step 6: Commit**

```bash
git add packages/react/src/use-uploader.ts packages/react/src/index.ts packages/react/test/unit/use-uploader.test.tsx
git commit -m "feat(react): useUploader (EPIC-21 #6/10)"
```

---

## Task 7: Vue `useUploader`

**Files:**

- Create: `packages/vue/src/use-uploader.ts`
- Modify: `packages/vue/src/index.ts`
- Test: `packages/vue/test/unit/use-uploader.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/vue/test/unit/use-uploader.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defineRecorder, defineUploader } from "@forinda/video-sdk-core";
import { installFakeMediaRecorder, type InstalledFakeRecorder } from "@forinda/test-helpers";
import { useUploader } from "@/use-uploader.ts";
import { withScope } from "../_helpers/with-scope.ts";

let fx: InstalledFakeRecorder;
beforeEach(() => {
  fx = installFakeMediaRecorder();
});
afterEach(() => fx.cleanup());

const fakeStream = (): MediaStream => ({}) as unknown as MediaStream;

describe("useUploader (Vue)", () => {
  it("wires recorder → uploader and surfaces state", async () => {
    const fetchImpl = vi.fn(async () => new Response("ok", { status: 200 }));
    const uploader = defineUploader({ url: "https://t/u", fetchImpl });
    const recorder = defineRecorder(fakeStream());

    const { result, dispose } = withScope(() => useUploader(recorder, uploader));
    expect(result.state.value).toBe("idle");

    recorder.start();
    fx.current?.__fire("dataavailable", { data: new Blob(["x"]) });
    await Promise.resolve();
    await Promise.resolve();

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    dispose();
  });

  it("retry() proxies to the uploader", async () => {
    let attempts = 0;
    const fetchImpl = vi.fn(async () => {
      attempts += 1;
      return attempts === 1
        ? new Response("nope", { status: 500 })
        : new Response("ok", { status: 200 });
    });
    const uploader = defineUploader({ url: "https://t/u", fetchImpl });
    const recorder = defineRecorder(fakeStream());

    const { result, dispose } = withScope(() => useUploader(recorder, uploader));

    recorder.start();
    fx.current?.__fire("dataavailable", { data: new Blob(["x"]) });
    await Promise.resolve();
    await Promise.resolve();
    expect(result.state.value).toBe("failed");

    await result.retry();
    expect(result.state.value).toBe("idle");

    dispose();
  });

  it("inert when recorder or uploader is null", () => {
    const { result, dispose } = withScope(() => useUploader(null, null));
    expect(result.state.value).toBe("idle");
    expect(result.pendingBytes.value).toBe(0);
    dispose();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
pnpm --filter @forinda/video-sdk-vue test -- use-uploader
```

Expected: failures.

- [ ] **Step 3: Implement the composable**

Create `packages/vue/src/use-uploader.ts`:

```ts
/**
 * `useUploader` — wire a `Recorder` to an `Uploader` for the lifetime of
 * the active scope. Returns reactive state for "Uploading…" /
 * "Failed (retry?)" UI.
 *
 * SSR-safe: returns inert refs on the server.
 */

import { onScopeDispose, ref, shallowRef, type Ref } from "vue";
import {
  pipeRecorderTo,
  type Recorder,
  type Uploader,
  type UploaderState,
} from "@forinda/video-sdk-core";
import { isServer } from "./internal/ssr.ts";

export interface UseUploaderResult {
  state: Ref<UploaderState>;
  pendingBytes: Ref<number>;
  error: Ref<Error | null>;
  retry: () => Promise<void>;
}

export function useUploader(
  recorder: Recorder | null,
  uploader: Uploader | null,
): UseUploaderResult {
  const state = ref<UploaderState>(uploader?.state ?? "idle");
  const pendingBytes = ref<number>(uploader?.pendingBytes ?? 0);
  const error = shallowRef<Error | null>(null);

  if (!isServer && recorder !== null && uploader !== null) {
    const dispose = pipeRecorderTo(recorder, uploader);

    const offState = uploader.on("state", (s) => {
      state.value = s;
      pendingBytes.value = uploader.pendingBytes;
    });
    const offAck = uploader.on("ack", () => {
      pendingBytes.value = uploader.pendingBytes;
    });
    const offError = uploader.on("error", (e) => {
      error.value = e;
    });

    onScopeDispose(() => {
      offState();
      offAck();
      offError();
      dispose();
    });
  }

  return {
    state,
    pendingBytes,
    error,
    retry: async () => {
      if (uploader !== null) await uploader.retry();
    },
  };
}
```

- [ ] **Step 4: Re-export from `packages/vue/src/index.ts`**

Append:

```ts
export { useUploader, type UseUploaderResult } from "./use-uploader.ts";
```

- [ ] **Step 5: Re-run the Vue suite**

```bash
pnpm --filter @forinda/video-sdk-vue test
```

Expected: green.

- [ ] **Step 6: Commit**

```bash
git add packages/vue/src/use-uploader.ts packages/vue/src/index.ts packages/vue/test/unit/use-uploader.test.ts
git commit -m "feat(vue): useUploader (EPIC-21 #7/10)"
```

---

## Task 8: Core README + uploader docs

**Files:**

- Modify: `packages/core/README.md`

- [ ] **Step 1: Add an "Uploading recordings" subsection**

In `packages/core/README.md`, locate the "Recording" section (just after the `defineRecorder` example). Append a new subsection:

````markdown
### Uploading recordings

Pair `defineRecorder` with `defineUploader` to stream chunks to a backend instead of buffering everything in memory. Set `timesliceMs` so the recorder fires `dataavailable` periodically; pipe each chunk into the uploader.

```ts
import { defineRecorder, defineUploader } from "@forinda/video-sdk-core";

const uploader = defineUploader({
  url: "/api/uploads",
  headers: { Authorization: `Bearer ${token}` },
  // Defaults: keepalive for chunks ≤ 60 KB, fall back to regular fetch above.
});

const recorder = defineRecorder(stream, { timesliceMs: 1_000 });
const dispose = recorder.pipeTo(uploader);

uploader.on("state", (s) => console.log("upload state:", s));
uploader.on("error", (e) => console.warn("upload error:", e));

recorder.start();
// ...later
await recorder.stop();
dispose();
```

When a `POST` returns 4xx/5xx, the uploader transitions to `"failed"` and the recorder pauses automatically. Recover with `await uploader.retry()` — recording resumes once the queue drains. The queue is capped by `maxQueuedBytes` (default 100 MiB); over-cap `send` calls reject so consumers see backpressure instead of silent OOM.
````

- [ ] **Step 2: Verify formatting**

```bash
pnpm format && pnpm format:check
```

Expected: green.

- [ ] **Step 3: Commit**

```bash
git add packages/core/README.md
git commit -m "docs(core): document defineUploader + Recorder.pipeTo (EPIC-21 #8/10)"
```

---

## Task 9: Elements + adapters READMEs

**Files:**

- Modify: `packages/web-components/README.md`
- Modify: `packages/react/README.md`
- Modify: `packages/vue/README.md`

- [ ] **Step 1: Update `packages/web-components/README.md`**

Find the `<forinda-recorder>` section. After the existing recorder example, append:

````markdown
#### Streaming uploads (declarative)

Pair `<forinda-recorder>` with `<forinda-uploader>` for one-line streaming uploads. The recorder element discovers slotted uploaders at `start()` and pipes every chunk to each.

```html
<forinda-video-publisher id="cam" ws="wss://..."></forinda-video-publisher>
<forinda-recorder for="cam" timeslice-ms="1000">
  <forinda-uploader
    url="/api/uploads"
    headers='{"Authorization":"Bearer t"}'
    max-queued-bytes="200000000"
  ></forinda-uploader>
</forinda-recorder>
```

- `for="cam"` reads the target's `mediaStream` property at `start()` time. Stream changes (e.g. swapping screen-share back to camera) are not auto-followed — call `el.stop()` then `el.start()` to pick up a new stream.
- Multiple `<forinda-uploader>` children are allowed; each gets its own pipe (useful for fan-out to redundant backends).
- An uploader entering `"failed"` state pauses the recorder automatically. Call `el.querySelector("forinda-uploader").uploader.retry()` to recover.
````

- [ ] **Step 2: Update `packages/react/README.md`**

Append a new hook entry under "Hooks":

````markdown
### `useUploader(recorder, uploader)`

Wire a `Recorder` to an `Uploader` for the lifetime of the calling component. Returns `{ state, pendingBytes, error, retry }`.

```ts
const { stream } = useUserMedia({ audio: true, video: true });
const recorder = useMemo(
  () => stream && defineRecorder(stream, { timesliceMs: 1000 }),
  [stream],
);
const uploader = useMemo(() => defineUploader({ url: "/api/uploads" }), []);
const { state, pendingBytes, retry } = useUploader(recorder, uploader);

return (
  <>
    <p>Upload: {state} ({pendingBytes} bytes pending)</p>
    {state === "failed" && <button onClick={retry}>Retry</button>}
  </>
);
```

When the uploader transitions to `"failed"` the underlying recorder is paused automatically; `retry()` resumes it.
````

- [ ] **Step 3: Update `packages/vue/README.md`**

Append the Vue equivalent under "Composables":

````markdown
### `useUploader(recorder, uploader)`

Wire a `Recorder` to an `Uploader` for the lifetime of the active scope. Returns reactive `{ state, pendingBytes, error, retry }`.

```ts
import { defineRecorder, defineUploader } from "@forinda/video-sdk-core";
import { useUploader, useUserMedia } from "@forinda/video-sdk-vue";

const { stream } = useUserMedia({ audio: true, video: true });
// Construct recorder/uploader once stream is ready (use v-if pattern).

const recorder = defineRecorder(stream.value!, { timesliceMs: 1000 });
const uploader = defineUploader({ url: "/api/uploads" });
const { state, pendingBytes, retry } = useUploader(recorder, uploader);
```

When the uploader transitions to `"failed"`, the recorder pauses; `retry()` resumes it.
````

- [ ] **Step 4: Format**

```bash
pnpm format && pnpm format:check
```

Expected: green.

- [ ] **Step 5: Commit**

```bash
git add packages/web-components/README.md packages/react/README.md packages/vue/README.md
git commit -m "docs: streaming uploads in elements + react + vue READMEs (EPIC-21 #9/10)"
```

---

## Task 10: Workspace verify, changeset, tag

**Files:**

- Create: `.changeset/recording-streaming.md`

- [ ] **Step 1: Workspace lint + typecheck + test + build**

```bash
pnpm typecheck && pnpm test && pnpm build && pnpm lint
```

Expected: every step exits 0.

- [ ] **Step 2: Create the changeset**

Create `.changeset/recording-streaming.md`:

```markdown
---
"@forinda/video-sdk-core": minor
"@forinda/video-sdk-elements": minor
"@forinda/video-sdk-react": minor
"@forinda/video-sdk-vue": minor
"@forinda/video-sdk-signaling-protocol": patch
"@forinda/video-sdk-signaling-ws": patch
"@forinda/video-sdk-signaling-broadcast": patch
---

Streaming-upload sink for `Recorder` + declarative element wiring.

### Added

- **`defineUploader({ url, headers?, maxQueuedBytes?, keepaliveThresholdBytes? })`** — HTTP-POST-per-chunk sink for streaming recordings off the device. Uses `fetch` with `keepalive: true` for chunks at or below the threshold (default 60 KB) so chunks survive a page unload, regular `fetch` above. Internal FIFO queue capped at 100 MiB by default.
- **`recorder.pipeTo(uploader)` / `pipeRecorderTo(recorder, uploader)`** — wires `dataavailable` → `uploader.send`. On `failed` → `recorder.pause()`; on recovery via `uploader.retry()` → `recorder.resume()`. Returns a disposer.
- **`<forinda-recorder for="…">`** — looks up `document.getElementById(for).mediaStream` at `start()` time. Lets you wire publisher → recorder declaratively without JS.
- **`<forinda-uploader url="…" headers="…">`** — slottable inside `<forinda-recorder>`. The recorder discovers slotted uploaders at start and pipes each chunk to them. Multiple uploaders allowed.
- **React: `useUploader(recorder, uploader)`** and **Vue: `useUploader(recorder, uploader)`** — adapter helpers exposing `{ state, pendingBytes, error, retry }`.

### Rationale

`defineRecorder` previously buffered every chunk in memory until `stop()`, putting a hard ceiling on recording length. `pipeTo(uploader)` drains chunks as they arrive, with explicit backpressure (`failed` → pause, consumer-driven `retry()` → resume) so a flaky upload server can't silently lose data.
```

- [ ] **Step 3: Commit**

```bash
git add .changeset/recording-streaming.md
git commit -m "chore: changeset for EPIC-21 streaming uploads (EPIC-21 #10/10)"
```

- [ ] **Step 4: Tag**

```bash
git tag -a v0.0.0-epic-21 -m "EPIC-21: Recording streaming + declarative element wiring"
```

---

## Self-review notes

**Spec coverage** (vs. roadmap acceptance criteria for EPIC-21):

- ✅ `defineUploader({ url, chunkSize?, headers? })` returns a sink — Task 2. (Used `keepaliveThresholdBytes` instead of `chunkSize` since the recorder controls chunk size via `timesliceMs`; adding a re-chunk layer would be premature.)
- ✅ `Recorder.pipeTo(uploader)` forwards `dataavailable` chunks via `fetch` with `keepalive` — Tasks 2 + 3.
- ✅ Backpressure: pauses recorder on 4xx / 5xx until consumer-defined retry resolves — Task 3.
- ✅ `<forinda-recorder for="my-publisher">` resolves the target element's `mediaStream` automatically — Task 5.
- ✅ `<forinda-uploader>` slottable inside `<forinda-recorder>` — Tasks 4 + 5.
- ✅ React: `useUploader(recorder, { url })` — Task 6 (signature is `useUploader(recorder, uploader)` since the consumer constructs the uploader explicitly; this is more flexible — same uploader can be reused across multiple recorders, headers can change reactively, etc.).
- ✅ Vue parity — Task 7.
- ✅ Tests cover chunk → fetch round-trip (Task 2), backpressure on error (Task 3), target resolution by id (Task 5).

**Type consistency:**

- `Uploader` / `UploaderState` / `UploaderEvents` / `UploaderOptions` defined once in `uploader-types.ts`, used everywhere.
- `pipeRecorderTo(recorder, uploader)` signature consistent across `pipe.ts`, `recorder.pipeTo`, both adapter hooks.
- React hook `useUploader(recorder, uploader)` and Vue composable `useUploader(recorder, uploader)` — same signature.

**Placeholders:** none. Every step has concrete code or commands.
