/**
 * Minimal `MediaRecorder` shim for jsdom. Installs on `globalThis` for the
 * duration of a test and lets the test drive the recorder lifecycle via
 * `__fire(event, payload?)` on the active instance.
 *
 * Surface matches only what `Recorder` actually uses.
 */

import { vi } from "vitest";

export interface FakeRecorder {
  state: "inactive" | "recording" | "paused";
  mimeType: string;
  start: ReturnType<typeof vi.fn>;
  stop: ReturnType<typeof vi.fn>;
  pause: ReturnType<typeof vi.fn>;
  resume: ReturnType<typeof vi.fn>;
  __fire(event: string, payload?: unknown): void;
}

export interface InstalledFakeRecorder {
  /** The most recently constructed recorder. `null` until `defineRecorder().start()` runs. */
  readonly current: FakeRecorder | null;
  setSupported(predicate: (mimeType: string) => boolean): void;
  cleanup(): void;
}

export function installFakeMediaRecorder(): InstalledFakeRecorder {
  let supported: (mimeType: string) => boolean = () => true;
  let current: FakeRecorder | null = null;

  function FakeCtor(this: FakeRecorder, _stream: MediaStream, options?: MediaRecorderOptions) {
    const handlers = new Map<string, Set<(event: unknown) => void>>();
    this.state = "inactive";
    this.mimeType = options?.mimeType ?? "";

    this.start = vi.fn((_timeslice?: number) => {
      this.state = "recording";
    });
    this.stop = vi.fn(() => {
      this.state = "inactive";
    });
    this.pause = vi.fn(() => {
      this.state = "paused";
      // Real MediaRecorder fires the "pause" event after the method returns;
      // tests that consume the wrapper depend on this transition firing.
      const bucket = handlers.get("pause");
      if (bucket) for (const h of bucket) h({});
    });
    this.resume = vi.fn(() => {
      this.state = "recording";
      const bucket = handlers.get("resume");
      if (bucket) for (const h of bucket) h({});
    });

    (this as unknown as { addEventListener: MediaRecorder["addEventListener"] }).addEventListener =
      ((event: string, handler: (e: unknown) => void) => {
        let bucket = handlers.get(event);
        if (!bucket) {
          bucket = new Set();
          handlers.set(event, bucket);
        }
        bucket.add(handler);
      }) as MediaRecorder["addEventListener"];

    (
      this as unknown as { removeEventListener: MediaRecorder["removeEventListener"] }
    ).removeEventListener = ((event: string, handler: (e: unknown) => void) => {
      handlers.get(event)?.delete(handler);
    }) as MediaRecorder["removeEventListener"];

    this.__fire = (event, payload = {}) => {
      handlers.get(event)?.forEach((h) => h(payload));
    };

    current = this;
  }

  (FakeCtor as unknown as { isTypeSupported: (m: string) => boolean }).isTypeSupported = (
    mimeType: string,
  ) => supported(mimeType);

  const original = (globalThis as { MediaRecorder?: unknown }).MediaRecorder;
  Object.defineProperty(globalThis, "MediaRecorder", {
    configurable: true,
    writable: true,
    value: FakeCtor,
  });

  return {
    get current() {
      return current;
    },
    setSupported(predicate) {
      supported = predicate;
    },
    cleanup() {
      if (original === undefined) {
        Reflect.deleteProperty(globalThis, "MediaRecorder");
      } else {
        Object.defineProperty(globalThis, "MediaRecorder", {
          configurable: true,
          writable: true,
          value: original,
        });
      }
      current = null;
      supported = () => true;
    },
  };
}
