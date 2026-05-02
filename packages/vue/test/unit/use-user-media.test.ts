import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useUserMedia } from "@/use-user-media.ts";
import { withScope } from "../_helpers/with-scope.ts";

interface FakeTrack {
  kind: "audio" | "video";
  stop: ReturnType<typeof vi.fn>;
}

function makeTrack(kind: "audio" | "video"): FakeTrack {
  return { kind, stop: vi.fn() };
}

function makeStream(tracks: FakeTrack[]): MediaStream {
  return {
    getTracks: () => tracks,
    getVideoTracks: () => tracks.filter((t) => t.kind === "video"),
    getAudioTracks: () => tracks.filter((t) => t.kind === "audio"),
  } as unknown as MediaStream;
}

let getUserMedia: ReturnType<typeof vi.fn>;

beforeEach(() => {
  getUserMedia = vi.fn();
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: { getUserMedia },
  });
});

afterEach(() => {
  Reflect.deleteProperty(navigator, "mediaDevices");
});

describe("useUserMedia", () => {
  it("auto-requests on creation and resolves to granted", async () => {
    const stream = makeStream([makeTrack("video"), makeTrack("audio")]);
    getUserMedia.mockResolvedValue(stream);

    const { result, dispose } = withScope(() => useUserMedia({ audio: true, video: true }));

    expect(result.state.value).toBe("requesting");
    await new Promise((r) => setTimeout(r, 0));
    expect(result.state.value).toBe("granted");
    expect(result.stream.value).toBe(stream);
    dispose();
  });

  it("maps NotAllowedError to denied", async () => {
    getUserMedia.mockRejectedValue(Object.assign(new Error("denied"), { name: "NotAllowedError" }));

    const { result, dispose } = withScope(() => useUserMedia({ audio: true, video: true }));
    await new Promise((r) => setTimeout(r, 0));
    expect(result.state.value).toBe("denied");
    expect(result.error.value).not.toBeNull();
    dispose();
  });

  it("stop() releases tracks and resets to idle", async () => {
    const v = makeTrack("video");
    const a = makeTrack("audio");
    getUserMedia.mockResolvedValue(makeStream([v, a]));

    const { result, dispose } = withScope(() => useUserMedia({ audio: true, video: true }));
    await new Promise((r) => setTimeout(r, 0));

    result.stop();
    expect(result.state.value).toBe("idle");
    expect(result.stream.value).toBeNull();
    expect(v.stop).toHaveBeenCalled();
    expect(a.stop).toHaveBeenCalled();
    dispose();
  });

  it("scope dispose stops tracks", async () => {
    const v = makeTrack("video");
    getUserMedia.mockResolvedValue(makeStream([v]));

    const { dispose } = withScope(() => useUserMedia({ video: true }));
    await new Promise((r) => setTimeout(r, 0));

    dispose();
    expect(v.stop).toHaveBeenCalled();
  });

  it("aborts an in-flight request when scope is disposed before resolution", async () => {
    const v = makeTrack("video");
    let resolveStream: (s: MediaStream) => void = () => {};
    const pending = new Promise<MediaStream>((resolve) => {
      resolveStream = resolve;
    });
    getUserMedia.mockReturnValue(pending);

    const { result, dispose } = withScope(() => useUserMedia({ video: true }));
    expect(result.state.value).toBe("requesting");
    dispose();

    resolveStream(makeStream([v]));
    await new Promise((r) => setTimeout(r, 0));

    // Stream from the post-dispose resolution must be torn down, not assigned.
    expect(result.stream.value).toBeNull();
    expect(v.stop).toHaveBeenCalled();
  });

  it("refresh() restarts the request", async () => {
    const v1 = makeTrack("video");
    const v2 = makeTrack("video");
    getUserMedia.mockResolvedValueOnce(makeStream([v1])).mockResolvedValueOnce(makeStream([v2]));

    const { result, dispose } = withScope(() => useUserMedia({ video: true }));
    await new Promise((r) => setTimeout(r, 0));
    expect(result.state.value).toBe("granted");

    await result.refresh();
    expect(v1.stop).toHaveBeenCalled();
    expect(result.stream.value).not.toBeNull();
    dispose();
  });
});
