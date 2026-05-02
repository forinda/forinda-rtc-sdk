import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { useDisplayMedia } from "@/use-display-media.ts";

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
  it("returns idle state without firing the picker when autoStart is omitted", async () => {
    const { result } = renderHook(() => useDisplayMedia());
    expect(result.current.state).toBe("idle");
    expect(result.current.stream).toBeNull();
    // Wait a tick to ensure no async request fired.
    await new Promise((r) => setTimeout(r, 5));
    expect(getDisplayMedia).not.toHaveBeenCalled();
  });

  it("auto-starts and resolves to granted when autoStart=true", async () => {
    const stream = makeStream([makeTrack("video")]);
    getDisplayMedia.mockResolvedValue(stream);

    const { result } = renderHook(() => useDisplayMedia({ autoStart: true }));

    await waitFor(() => expect(result.current.state).toBe("granted"));
    expect(result.current.stream).toBe(stream);
    expect(getDisplayMedia).toHaveBeenCalledWith({ audio: false, video: true });
  });

  it("start() opens the picker on demand", async () => {
    const stream = makeStream([makeTrack("video")]);
    getDisplayMedia.mockResolvedValue(stream);

    const { result } = renderHook(() => useDisplayMedia());

    await act(async () => {
      await result.current.start();
    });

    expect(result.current.state).toBe("granted");
    expect(result.current.stream).toBe(stream);
  });

  it("flips to 'ended' when the user stops sharing via the browser UI", async () => {
    const videoTrack = makeTrack("video");
    const stream = makeStream([videoTrack]);
    getDisplayMedia.mockResolvedValue(stream);

    const { result } = renderHook(() => useDisplayMedia({ autoStart: true }));
    await waitFor(() => expect(result.current.state).toBe("granted"));

    act(() => {
      videoTrack.__end();
    });

    await waitFor(() => expect(result.current.state).toBe("ended"));
    expect(result.current.stream).toBeNull();
  });

  it("maps PermissionDenied (user cancelled picker) to state='denied'", async () => {
    getDisplayMedia.mockRejectedValue(
      Object.assign(new Error("denied"), { name: "NotAllowedError" }),
    );

    const { result } = renderHook(() => useDisplayMedia({ autoStart: true }));
    await waitFor(() => expect(result.current.state).toBe("denied"));
    expect(result.current.error).not.toBeNull();
  });

  it("stop() releases tracks and resets to idle", async () => {
    const videoTrack = makeTrack("video");
    const audioTrack = makeTrack("audio");
    const stream = makeStream([videoTrack, audioTrack]);
    getDisplayMedia.mockResolvedValue(stream);

    const { result } = renderHook(() => useDisplayMedia({ autoStart: true }));
    await waitFor(() => expect(result.current.state).toBe("granted"));

    act(() => {
      result.current.stop();
    });

    expect(result.current.state).toBe("idle");
    expect(result.current.stream).toBeNull();
    expect(videoTrack.stop).toHaveBeenCalled();
    expect(audioTrack.stop).toHaveBeenCalled();
  });

  it("forwards explicit audio:true to getDisplayMedia", async () => {
    const stream = makeStream([makeTrack("video"), makeTrack("audio")]);
    getDisplayMedia.mockResolvedValue(stream);

    renderHook(() => useDisplayMedia({ autoStart: true, audio: true }));
    await waitFor(() => expect(getDisplayMedia).toHaveBeenCalled());
    expect(getDisplayMedia).toHaveBeenCalledWith({ audio: true, video: true });
  });
});
