import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { nextTick } from "vue";
import { installFakeMediaRecorder, type InstalledFakeRecorder } from "@forinda/test-helpers";
import { useRecorder } from "@/use-recorder.ts";
import { withScope } from "../_helpers/with-scope.ts";

let fx: InstalledFakeRecorder;

beforeEach(() => {
  fx = installFakeMediaRecorder();
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
    const { result, dispose } = withScope(() => useRecorder(fakeStream()));
    expect(result.state.value).toBe("idle");
    expect(result.recorder.value).toBeNull();
    expect(fx.current).toBeNull();
    dispose();
  });

  it("inert when stream is null", () => {
    const { result, dispose } = withScope(() => useRecorder(null));
    expect(result.state.value).toBe("idle");
    result.start();
    expect(fx.current).toBeNull();
    dispose();
  });

  it("flips to 'recording' on start() and accumulates chunks", () => {
    const { result, dispose } = withScope(() => useRecorder(fakeStream()));
    result.start();
    expect(result.state.value).toBe("recording");
    fx.current?.__fire("dataavailable", { data: new Blob(["a"]) });
    fx.current?.__fire("dataavailable", { data: new Blob(["b"]) });
    expect(result.chunks.value).toHaveLength(2);
    dispose();
  });

  it("stop() resolves with the blob and exposes it as `blob`", async () => {
    const { result, dispose } = withScope(() => useRecorder(fakeStream()));
    result.start();
    fx.current?.__fire("dataavailable", { data: new Blob(["xyz"]) });

    const stopPromise = result.stop();
    fx.current?.__fire("stop");
    const resolved = await stopPromise;

    expect(resolved).toBeInstanceOf(Blob);
    expect(result.state.value).toBe("stopped");
    expect(result.blob.value).toBe(resolved);
    dispose();
  });

  it("surfaces errors from the underlying recorder", () => {
    const { result, dispose } = withScope(() => useRecorder(fakeStream()));
    result.start();
    const native = new Error("boom");
    fx.current?.__fire("error", { error: native });
    expect(result.error.value).toBe(native);
    expect(result.state.value).toBe("error");
    dispose();
  });

  it("auto-stops on scope dispose when still recording", () => {
    const { result, dispose } = withScope(() => useRecorder(fakeStream()));
    result.start();
    const stopSpy = fx.current?.stop as ReturnType<typeof vi.fn>;
    dispose();
    expect(stopSpy).toHaveBeenCalled();
  });

  it("exposes downloadUrl after stop and revokes it on dispose", async () => {
    const createSpy = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:fake");
    const revokeSpy = vi.spyOn(URL, "revokeObjectURL");

    const { result, dispose } = withScope(() => useRecorder(fakeStream()));
    expect(result.downloadUrl.value).toBeNull();

    result.start();
    fx.current?.__fire("dataavailable", { data: new Blob(["x"]) });
    const p = result.stop();
    fx.current?.__fire("stop");
    await p;
    await nextTick();

    expect(createSpy).toHaveBeenCalledOnce();
    expect(result.downloadUrl.value).toBe("blob:fake");

    dispose();
    expect(revokeSpy).toHaveBeenCalledWith("blob:fake");
  });
});
