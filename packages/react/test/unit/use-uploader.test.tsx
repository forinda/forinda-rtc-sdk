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
