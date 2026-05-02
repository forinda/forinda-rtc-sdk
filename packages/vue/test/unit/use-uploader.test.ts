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
