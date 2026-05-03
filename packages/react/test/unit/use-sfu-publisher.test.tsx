import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@forinda/video-sdk-sfu-livekit", () => ({
  defineSfuPublisher: vi.fn(),
}));

import { defineSfuPublisher } from "@forinda/video-sdk-sfu-livekit";
import { useSfuPublisher } from "@/use-sfu-publisher.ts";

const fakeStream = (): MediaStream =>
  ({
    id: "fake",
    getTracks: () => [],
    getVideoTracks: () => [],
    getAudioTracks: () => [],
  }) as unknown as MediaStream;

beforeEach(() => {
  vi.mocked(defineSfuPublisher).mockReset();
});
afterEach(() => vi.restoreAllMocks());

describe("useSfuPublisher", () => {
  it("constructs a publisher and auto-starts when stream is provided", async () => {
    const handlers = new Map<string, (...args: unknown[]) => void>();
    const fake = {
      state: "idle" as const,
      peerId: "alice",
      peers: () => [],
      on: vi.fn((event: string, fn: (...args: unknown[]) => void) => {
        handlers.set(event, fn);
        return () => handlers.delete(event);
      }),
      start: vi.fn(async () => {
        handlers.get("state")?.("connected");
      }),
      stop: vi.fn(async () => {}),
      replaceVideoTrack: vi.fn(async () => {}),
      replaceAudioTrack: vi.fn(async () => {}),
    };
    vi.mocked(defineSfuPublisher).mockReturnValue(fake as never);

    const { result } = renderHook(() =>
      useSfuPublisher({
        url: "ws://x",
        token: "t",
        room: "demo",
        peerId: "alice",
        stream: fakeStream(),
      }),
    );

    await waitFor(() => expect(result.current.publisher).not.toBeNull());
    await waitFor(() => expect(fake.start).toHaveBeenCalled());
  });
});
