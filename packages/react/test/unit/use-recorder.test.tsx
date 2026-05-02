import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useRecorder } from "@/use-recorder.ts";

interface FakeRecorder {
  state: "inactive" | "recording" | "paused";
  mimeType: string;
  start: ReturnType<typeof vi.fn>;
  stop: ReturnType<typeof vi.fn>;
  pause: ReturnType<typeof vi.fn>;
  resume: ReturnType<typeof vi.fn>;
  __fire(event: string, payload?: unknown): void;
}

let current: FakeRecorder | null = null;

beforeEach(() => {
  current = null;
  function FakeCtor(this: FakeRecorder, _stream: MediaStream, options?: MediaRecorderOptions) {
    const handlers = new Map<string, Set<(e: unknown) => void>>();
    this.state = "inactive";
    this.mimeType = options?.mimeType ?? "";
    this.start = vi.fn(() => {
      this.state = "recording";
    });
    this.stop = vi.fn(() => {
      this.state = "inactive";
    });
    this.pause = vi.fn(() => {
      this.state = "paused";
    });
    this.resume = vi.fn(() => {
      this.state = "recording";
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
    ).removeEventListener = (() => {}) as MediaRecorder["removeEventListener"];
    this.__fire = (event, payload = {}) => {
      handlers.get(event)?.forEach((h) => h(payload));
    };
    current = this;
  }
  (FakeCtor as unknown as { isTypeSupported: (m: string) => boolean }).isTypeSupported = () => true;
  Object.defineProperty(globalThis, "MediaRecorder", {
    configurable: true,
    writable: true,
    value: FakeCtor,
  });
});

afterEach(() => {
  Reflect.deleteProperty(globalThis as object, "MediaRecorder");
  current = null;
});

const fakeStream = (): MediaStream => ({}) as unknown as MediaStream;

describe("useRecorder", () => {
  it("returns idle state and constructs no recorder before start()", () => {
    const { result } = renderHook(() => useRecorder(fakeStream()));
    expect(result.current.state).toBe("idle");
    expect(result.current.recorder).toBeNull();
    expect(current).toBeNull();
  });

  it("returns inert state when stream is null", () => {
    const { result } = renderHook(() => useRecorder(null));
    expect(result.current.state).toBe("idle");
    act(() => result.current.start());
    expect(current).toBeNull();
  });

  it("flips to 'recording' on start() and accumulates chunks via dataavailable", () => {
    const { result } = renderHook(() => useRecorder(fakeStream()));

    act(() => result.current.start());
    expect(result.current.state).toBe("recording");

    act(() => current?.__fire("dataavailable", { data: new Blob(["a"]) }));
    act(() => current?.__fire("dataavailable", { data: new Blob(["b"]) }));

    expect(result.current.chunks).toHaveLength(2);
  });

  it("stop() resolves with the assembled blob and exposes it as `blob`", async () => {
    const { result } = renderHook(() => useRecorder(fakeStream()));

    act(() => result.current.start());
    act(() => current?.__fire("dataavailable", { data: new Blob(["xyz"]) }));

    let resolved: Blob | null = null;
    await act(async () => {
      const stopPromise = result.current.stop();
      current?.__fire("stop");
      resolved = await stopPromise;
    });

    expect(resolved).toBeInstanceOf(Blob);
    expect(result.current.state).toBe("stopped");
    expect(result.current.blob).toBe(resolved);
  });

  it("surfaces errors from the underlying recorder", () => {
    const { result } = renderHook(() => useRecorder(fakeStream()));
    act(() => result.current.start());

    const native = new Error("boom");
    act(() => current?.__fire("error", { error: native }));

    expect(result.current.error).toBe(native);
    expect(result.current.state).toBe("error");
  });

  it("auto-stops on unmount when still recording", () => {
    const { result, unmount } = renderHook(() => useRecorder(fakeStream()));
    act(() => result.current.start());
    const stopSpy = current?.stop as ReturnType<typeof vi.fn>;

    unmount();

    expect(stopSpy).toHaveBeenCalled();
  });
});
