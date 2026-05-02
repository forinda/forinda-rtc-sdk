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
