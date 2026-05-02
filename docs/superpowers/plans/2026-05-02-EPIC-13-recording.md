# EPIC-13 Recording Implementation Plan

> **For agentic workers:** Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wrap `MediaRecorder` in our factory style and expose it across core / react / elements so consumers can record any `MediaStream` (own camera, screen share, or an inbound viewer stream) to a `Blob` with sensible codec defaults and rolling chunks.

**Architecture:** Pure browser API wrap — no signaling involvement. `defineRecorder(stream, opts)` constructs a `MediaRecorder` with a chosen mime type (auto-pick from preferences when not provided), exposes typed events + a state machine, and yields a final `Blob` on stop. Sub-exported from `@forinda/video-sdk-core` rather than a new package — keeps fan-out small and the implementation is ~150 LOC.

**Out of scope:** publisher-side cooperative recording (publisher records their own outbound + uploads), canvas-composited multi-stream recording, transcription. Those are post-v0.1.

---

## File Structure

- `packages/core/src/recording/types.ts` — option + event shapes.
- `packages/core/src/recording/codec-support.ts` — `isRecordingTypeSupported` + `pickRecordingType` helpers.
- `packages/core/src/recording/recorder.ts` — `defineRecorder` factory + `Recorder` class.
- `packages/core/src/index.ts` — re-export.
- `packages/core/test/_mocks/fake-media-recorder.ts` — minimal `MediaRecorder` stand-in for jsdom.
- `packages/core/test/unit/recording/recorder.test.ts` — full lifecycle, event, error tests.
- `packages/core/test/unit/recording/codec-support.test.ts` — capability-detection branches.
- `packages/react/src/use-recorder.ts` — React hook.
- `packages/react/src/index.ts` — re-export.
- `packages/react/test/unit/use-recorder.test.tsx` — hook tests.
- `packages/web-components/src/elements/recorder.ts` — `<forinda-recorder>` element.
- `packages/web-components/src/elements/register.ts` — register.
- `packages/web-components/src/index.ts` + `manual.ts` — re-export.
- `packages/web-components/test/unit/recorder.test.ts` — element tests.
- READMEs for `core`, `react`, `elements` updated.

---

## Task 1: Core — `defineRecorder` + codec helpers

**Files:**

- Create: `packages/core/src/recording/types.ts`
- Create: `packages/core/src/recording/codec-support.ts`
- Create: `packages/core/src/recording/recorder.ts`
- Modify: `packages/core/src/index.ts`
- Create: `packages/core/test/_mocks/fake-media-recorder.ts`
- Create: `packages/core/test/unit/recording/codec-support.test.ts`
- Create: `packages/core/test/unit/recording/recorder.test.ts`

- [ ] **Step 1: Type shapes**

```ts
// recording/types.ts
export type RecorderState = "idle" | "recording" | "paused" | "stopped" | "error";

export interface RecorderOptions {
  /**
   * Preferred mime type (e.g. `"video/webm;codecs=vp9,opus"`). When omitted
   * the recorder picks the first supported entry from `codecPreferences`.
   */
  mimeType?: string;
  /**
   * Ordered fallback list. Default: `["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm", "video/mp4"]`.
   * Ignored when `mimeType` is supplied.
   */
  codecPreferences?: readonly string[];
  videoBitsPerSecond?: number;
  audioBitsPerSecond?: number;
  /** Forwarded to `recorder.start(timeslice)` for chunked output. */
  timesliceMs?: number;
}

export interface RecorderChunk {
  data: Blob;
  timestamp: number;
}

export type RecorderEvents = {
  start: { mimeType: string };
  dataavailable: RecorderChunk;
  pause: void;
  resume: void;
  stop: { blob: Blob; mimeType: string; durationMs: number };
  error: Error;
  state: RecorderState;
};
```

- [ ] **Step 2: Codec support helpers**

```ts
// recording/codec-support.ts
export const DEFAULT_CODEC_PREFERENCES = [
  "video/webm;codecs=vp9,opus",
  "video/webm;codecs=vp8,opus",
  "video/webm",
  "video/mp4",
] as const;

export function isRecordingTypeSupported(mimeType: string): boolean {
  if (typeof MediaRecorder === "undefined") return false;
  return MediaRecorder.isTypeSupported(mimeType);
}

export function pickRecordingType(preferences: readonly string[]): string | null {
  for (const t of preferences) if (isRecordingTypeSupported(t)) return t;
  return null;
}
```

- [ ] **Step 3: `Recorder` class + factory**

The `Recorder` wraps `MediaRecorder` and exposes a typed event surface via `defineEmitter`. Tracks state transitions, accumulates chunks into `chunks: Blob[]`, builds the final `Blob` on `stop`, and surfaces errors as typed events instead of bare DOM events.

Key methods:

- `start(): void` — sets up listeners, calls `mediaRecorder.start(timesliceMs)`. Throws `ConfigurationError` if no codec is supported.
- `stop(): Promise<Blob>` — calls `mediaRecorder.stop()`, awaits the final `dataavailable` + `stop` events, returns the assembled Blob.
- `pause()` / `resume()`: passthrough.
- `state`: getter.
- `chunks`: read-only.
- `mimeType`: resolved value (from option or picker).

State machine: `idle → recording → (paused ↔ recording) → stopped`. Errors flip to `error`.

- [ ] **Step 4: Re-export**

```ts
// core/src/index.ts
export {
  defineRecorder,
  Recorder,
  isRecordingTypeSupported,
  pickRecordingType,
  DEFAULT_CODEC_PREFERENCES,
  type RecorderOptions,
  type RecorderEvents,
  type RecorderChunk,
  type RecorderState,
} from "./recording/...";
```

- [ ] **Step 5: Fake `MediaRecorder` for jsdom**

```ts
// test/_mocks/fake-media-recorder.ts
// Installs a minimal MediaRecorder shim with isTypeSupported, start/stop/pause/resume,
// and __fire(event, payload) for tests to drive lifecycle events.
```

- [ ] **Step 6: Tests**

Codec support: returns false when MediaRecorder undefined; respects each preference; `pickRecordingType` returns null when nothing is supported.

Recorder: lifecycle (`start → recording`, `pause → paused`, `resume → recording`, `stop → stopped`); chunks accumulate via `dataavailable`; final blob mime equals chosen type; error event fires on bogus mime type; idempotent stop; passes `timesliceMs` to underlying recorder.

- [ ] **Step 7: Verify + commit**

```bash
pnpm --filter @forinda/video-sdk-core test
pnpm --filter @forinda/video-sdk-core typecheck
git add packages/core
git commit -m "feat(core): defineRecorder + codec helpers (EPIC-13 task 1)"
```

---

## Task 2: React — `useRecorder`

- [ ] Implement `useRecorder(stream, opts?)` returning `{ recorder, state, blob, chunks, start, stop, pause, resume, error }`. Stable callbacks via `useCallback`. Auto-stop on unmount (cleanup via `AbortController`).

- [ ] Hook tests (mock the core Recorder via injection or use the fake-MediaRecorder shim transitively).

- [ ] Re-export, commit.

---

## Task 3: Web component — `<forinda-recorder>`

- [ ] `<forinda-recorder>` accepts `stream` as a JS property (not attribute, since MediaStream isn't serializable). Attributes: `mime-type`, `video-bps`, `audio-bps`, `timeslice-ms`, `auto-start`. Methods: `start()` / `stop()` / `pause()` / `resume()`. Events: `recorder-start`, `recorder-stop`, `recorder-error`.

- [ ] Default rendering: a small button + status text in shadow DOM, both stylable via `::part(button)` / `::part(status)`. Clicking the button toggles record/stop. Slot for custom UI.

- [ ] On `stop`, the element fires `recorder-stop` with `{ blob, url }` (creates an `objectURL` for download convenience).

- [ ] Tests + register.

---

## Task 4: README updates + tag

- [ ] Core README: new "Recording" subsection with options table + example.
- [ ] React README: `useRecorder` row.
- [ ] Elements README: `<forinda-recorder>` attributes + events.
- [ ] `git tag -a v0.0.0-epic-13 -m "EPIC-13: recording"`
