import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useDisplayMedia } from "@/use-display-media.ts";
import { withScope } from "../_helpers/with-scope.ts";

interface FakeTrack {
  kind: "audio" | "video";
  stop: ReturnType<typeof vi.fn>;
  addEventListener: (event: string, handler: () => void) => void;
  __end: () => void;
}

function makeTrack(kind: "audio" | "video"): FakeTrack {
  const handlers = new Set<() => void>();
  return {
    kind,
    stop: vi.fn(),
    addEventListener(event, handler) {
      if (event === "ended") handlers.add(handler);
    },
    __end() {
      for (const h of handlers) h();
    },
  };
}

function makeStream(tracks: FakeTrack[]): MediaStream {
  return {
    getTracks: () => tracks,
    getVideoTracks: () => tracks.filter((t) => t.kind === "video"),
    getAudioTracks: () => tracks.filter((t) => t.kind === "audio"),
  } as unknown as MediaStream;
}

let getDisplayMedia: ReturnType<typeof vi.fn>;

beforeEach(() => {
  getDisplayMedia = vi.fn();
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: { getDisplayMedia },
  });
});

afterEach(() => {
  Reflect.deleteProperty(navigator, "mediaDevices");
});

describe("useDisplayMedia", () => {
  it("idle without firing the picker when autoStart is omitted", async () => {
    const { result, dispose } = withScope(() => useDisplayMedia());
    expect(result.state.value).toBe("idle");
    expect(result.stream.value).toBeNull();
    await new Promise((r) => setTimeout(r, 5));
    expect(getDisplayMedia).not.toHaveBeenCalled();
    dispose();
  });

  it("auto-starts and resolves to granted when autoStart=true", async () => {
    const stream = makeStream([makeTrack("video")]);
    getDisplayMedia.mockResolvedValue(stream);

    const { result, dispose } = withScope(() => useDisplayMedia({ autoStart: true }));
    await new Promise((r) => setTimeout(r, 0));
    expect(result.state.value).toBe("granted");
    expect(result.stream.value).toBe(stream);
    expect(getDisplayMedia).toHaveBeenCalledWith({ audio: false, video: true });
    dispose();
  });

  it("start() opens the picker on demand", async () => {
    const stream = makeStream([makeTrack("video")]);
    getDisplayMedia.mockResolvedValue(stream);

    const { result, dispose } = withScope(() => useDisplayMedia());
    await result.start();
    expect(result.state.value).toBe("granted");
    expect(result.stream.value).toBe(stream);
    dispose();
  });

  it("flips to 'ended' when the user stops sharing via the browser UI", async () => {
    const v = makeTrack("video");
    getDisplayMedia.mockResolvedValue(makeStream([v]));

    const { result, dispose } = withScope(() => useDisplayMedia({ autoStart: true }));
    await new Promise((r) => setTimeout(r, 0));
    expect(result.state.value).toBe("granted");

    v.__end();
    expect(result.state.value).toBe("ended");
    expect(result.stream.value).toBeNull();
    dispose();
  });

  it("maps NotAllowedError (cancelled picker) to denied", async () => {
    getDisplayMedia.mockRejectedValue(
      Object.assign(new Error("denied"), { name: "NotAllowedError" }),
    );

    const { result, dispose } = withScope(() => useDisplayMedia({ autoStart: true }));
    await new Promise((r) => setTimeout(r, 0));
    expect(result.state.value).toBe("denied");
    expect(result.error.value).not.toBeNull();
    dispose();
  });

  it("stop() releases tracks and resets to idle", async () => {
    const v = makeTrack("video");
    const a = makeTrack("audio");
    getDisplayMedia.mockResolvedValue(makeStream([v, a]));

    const { result, dispose } = withScope(() => useDisplayMedia({ autoStart: true }));
    await new Promise((r) => setTimeout(r, 0));

    result.stop();
    expect(result.state.value).toBe("idle");
    expect(result.stream.value).toBeNull();
    expect(v.stop).toHaveBeenCalled();
    expect(a.stop).toHaveBeenCalled();
    dispose();
  });

  it("forwards explicit audio:true to getDisplayMedia", async () => {
    getDisplayMedia.mockResolvedValue(makeStream([makeTrack("video"), makeTrack("audio")]));
    const { dispose } = withScope(() => useDisplayMedia({ autoStart: true, audio: true }));
    await new Promise((r) => setTimeout(r, 0));
    expect(getDisplayMedia).toHaveBeenCalledWith({ audio: true, video: true });
    dispose();
  });
});
