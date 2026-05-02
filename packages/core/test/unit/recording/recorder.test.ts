import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ConfigurationError } from "@/errors/errors.ts";
import { defineRecorder } from "@/recording/recorder.ts";
import { installFakeMediaRecorder, type InstalledFakeRecorder } from "@forinda/test-helpers";

const fakeStream = (): MediaStream => ({}) as unknown as MediaStream;

let fx: InstalledFakeRecorder;

beforeEach(() => {
  fx = installFakeMediaRecorder();
});

afterEach(() => {
  fx.cleanup();
});

describe("defineRecorder — lifecycle", () => {
  it("starts in 'idle' and transitions to 'recording' on start()", () => {
    const r = defineRecorder(fakeStream());
    expect(r.state).toBe("idle");

    r.start();

    expect(r.state).toBe("recording");
    expect(fx.current?.start).toHaveBeenCalledOnce();
  });

  it("emits 'start' event with the resolved mime type", () => {
    const handler = vi.fn();
    const r = defineRecorder(fakeStream());
    r.on("start", handler);

    r.start();

    expect(handler).toHaveBeenCalledWith({ mimeType: "video/webm;codecs=vp9,opus" });
    expect(r.mimeType).toBe("video/webm;codecs=vp9,opus");
  });

  it("respects an explicit mimeType when supported", () => {
    const r = defineRecorder(fakeStream(), { mimeType: "video/mp4" });
    r.start();
    expect(r.mimeType).toBe("video/mp4");
  });

  it("throws ConfigurationError when explicit mimeType is unsupported", () => {
    fx.setSupported((m) => m === "video/webm");
    const r = defineRecorder(fakeStream(), { mimeType: "video/x-bogus" });
    expect(() => r.start()).toThrow(ConfigurationError);
    expect(r.state).toBe("idle");
  });

  it("throws ConfigurationError when no codec in preferences is supported", () => {
    fx.setSupported(() => false);
    const r = defineRecorder(fakeStream());
    expect(() => r.start()).toThrow(ConfigurationError);
  });

  it("forwards bitrate hints + timesliceMs", () => {
    const r = defineRecorder(fakeStream(), {
      videoBitsPerSecond: 2_000_000,
      audioBitsPerSecond: 128_000,
      timesliceMs: 250,
    });
    r.start();
    expect(fx.current?.start).toHaveBeenCalledWith(250);
  });

  it("pause() and resume() transition state and emit events", () => {
    const events: string[] = [];
    const r = defineRecorder(fakeStream());
    r.on("pause", () => events.push("pause"));
    r.on("resume", () => events.push("resume"));

    r.start();
    fx.current?.__fire("pause");
    expect(r.state).toBe("paused");

    fx.current?.__fire("resume");
    expect(r.state).toBe("recording");

    expect(events).toEqual(["pause", "resume"]);
  });

  it("dataavailable accumulates non-empty chunks and emits typed events", () => {
    const onData = vi.fn();
    const r = defineRecorder(fakeStream());
    r.on("dataavailable", onData);

    r.start();

    const chunk1 = new Blob(["aaa"], { type: "video/webm" });
    const chunk2 = new Blob(["bbb"], { type: "video/webm" });
    fx.current?.__fire("dataavailable", { data: chunk1 });
    fx.current?.__fire("dataavailable", { data: new Blob([], { type: "video/webm" }) });
    fx.current?.__fire("dataavailable", { data: chunk2 });

    expect(r.chunks).toEqual([chunk1, chunk2]);
    expect(onData).toHaveBeenCalledTimes(2);
  });

  it("stop() resolves with the assembled blob and emits 'stop'", async () => {
    const onStop = vi.fn();
    const r = defineRecorder(fakeStream());
    r.on("stop", onStop);

    r.start();
    fx.current?.__fire("dataavailable", { data: new Blob(["xyz"], { type: "video/webm" }) });

    const stopPromise = r.stop();
    fx.current?.__fire("stop");

    const blob = await stopPromise;
    expect(blob.size).toBe(3);
    expect(blob.type).toBe("video/webm;codecs=vp9,opus");
    expect(r.state).toBe("stopped");
    expect(onStop).toHaveBeenCalledOnce();
    const stopPayload = onStop.mock.calls[0]?.[0] as {
      blob: Blob;
      mimeType: string;
      durationMs: number;
    };
    expect(stopPayload.mimeType).toBe("video/webm;codecs=vp9,opus");
    expect(stopPayload.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("stop() is idempotent — second call resolves without re-firing 'stop'", async () => {
    const onStop = vi.fn();
    const r = defineRecorder(fakeStream());
    r.on("stop", onStop);

    r.start();
    fx.current?.__fire("dataavailable", { data: new Blob(["x"]) });
    const first = r.stop();
    fx.current?.__fire("stop");
    await first;

    const second = await r.stop();
    expect(second).toBeInstanceOf(Blob);
    expect(onStop).toHaveBeenCalledOnce();
  });

  it("error event surfaces native Error from underlying recorder", () => {
    const onError = vi.fn();
    const r = defineRecorder(fakeStream());
    r.on("error", onError);

    r.start();
    const native = new Error("recorder boom");
    fx.current?.__fire("error", { error: native });

    expect(onError).toHaveBeenCalledWith(native);
    expect(r.state).toBe("error");
  });

  it("cannot start twice", () => {
    const r = defineRecorder(fakeStream());
    r.start();
    expect(() => r.start()).toThrow(ConfigurationError);
  });

  it("emits buffer-overflow + transitions to error when maxBufferedBytes is exceeded", () => {
    const onOverflow = vi.fn();
    const onError = vi.fn();
    const r = defineRecorder(fakeStream(), { maxBufferedBytes: 5 });
    r.on("buffer-overflow", onOverflow);
    r.on("error", onError);

    r.start();
    fx.current?.__fire("dataavailable", { data: new Blob(["aa"]) }); // 2 bytes — under cap
    expect(r.bufferedByteCount).toBe(2);

    fx.current?.__fire("dataavailable", { data: new Blob(["bbbbb"]) }); // would push to 7 — over cap

    expect(onOverflow).toHaveBeenCalledOnce();
    expect(onOverflow).toHaveBeenCalledWith({ bufferedBytes: 2, limit: 5 });
    expect(onError).toHaveBeenCalledOnce();
    expect(r.state).toBe("error");
    expect(r.bufferedByteCount).toBe(2); // overflow chunk was dropped
    expect(fx.current?.stop).toHaveBeenCalled();
  });
});
