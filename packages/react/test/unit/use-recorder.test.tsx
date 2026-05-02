import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useRecorder } from "@/use-recorder.ts";
import { installFakeMediaRecorder, type InstalledFakeRecorder } from "@forinda/test-helpers";

let fx: InstalledFakeRecorder;

beforeEach(() => {
  fx = installFakeMediaRecorder();
  // jsdom doesn't ship URL.createObjectURL — install a noop so the hook's
  // downloadUrl effect doesn't throw. Tests that care override it via spy.
  if (typeof URL.createObjectURL !== "function") {
    (URL as unknown as { createObjectURL: (b: Blob) => string }).createObjectURL = () =>
      "blob:fake";
    (URL as unknown as { revokeObjectURL: (url: string) => void }).revokeObjectURL = () => {};
  }
});

afterEach(() => {
  fx.cleanup();
  vi.restoreAllMocks();
});

const fakeStream = (): MediaStream => ({}) as unknown as MediaStream;

describe("useRecorder", () => {
  it("returns idle state and constructs no recorder before start()", () => {
    const { result } = renderHook(() => useRecorder(fakeStream()));
    expect(result.current.state).toBe("idle");
    expect(result.current.recorder).toBeNull();
    expect(fx.current).toBeNull();
  });

  it("returns inert state when stream is null", () => {
    const { result } = renderHook(() => useRecorder(null));
    expect(result.current.state).toBe("idle");
    act(() => result.current.start());
    expect(fx.current).toBeNull();
  });

  it("flips to 'recording' on start() and accumulates chunks via dataavailable", () => {
    const { result } = renderHook(() => useRecorder(fakeStream()));

    act(() => result.current.start());
    expect(result.current.state).toBe("recording");

    act(() => fx.current?.__fire("dataavailable", { data: new Blob(["a"]) }));
    act(() => fx.current?.__fire("dataavailable", { data: new Blob(["b"]) }));

    expect(result.current.chunks).toHaveLength(2);
  });

  it("stop() resolves with the assembled blob and exposes it as `blob`", async () => {
    const { result } = renderHook(() => useRecorder(fakeStream()));

    act(() => result.current.start());
    act(() => fx.current?.__fire("dataavailable", { data: new Blob(["xyz"]) }));

    let resolved: Blob | null = null;
    await act(async () => {
      const stopPromise = result.current.stop();
      fx.current?.__fire("stop");
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
    act(() => fx.current?.__fire("error", { error: native }));

    expect(result.current.error).toBe(native);
    expect(result.current.state).toBe("error");
  });

  it("auto-stops on unmount when still recording", () => {
    const { result, unmount } = renderHook(() => useRecorder(fakeStream()));
    act(() => result.current.start());
    const stopSpy = fx.current?.stop as ReturnType<typeof vi.fn>;

    unmount();

    expect(stopSpy).toHaveBeenCalled();
  });

  it("exposes downloadUrl after stop and revokes it on unmount", async () => {
    const createSpy = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:fake");
    const revokeSpy = vi.spyOn(URL, "revokeObjectURL");

    const { result, unmount } = renderHook(() => useRecorder(fakeStream()));
    expect(result.current.downloadUrl).toBeNull();

    act(() => result.current.start());
    act(() => fx.current?.__fire("dataavailable", { data: new Blob(["x"]) }));
    await act(async () => {
      const p = result.current.stop();
      fx.current?.__fire("stop");
      await p;
    });

    expect(createSpy).toHaveBeenCalledOnce();
    expect(result.current.downloadUrl).toBe("blob:fake");

    unmount();
    expect(revokeSpy).toHaveBeenCalledWith("blob:fake");
  });
});
