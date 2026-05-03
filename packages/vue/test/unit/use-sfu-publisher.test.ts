import { describe, expect, it, vi } from "vitest";
import { withScope } from "../_helpers/with-scope.ts";

vi.mock("@forinda/video-sdk-sfu-livekit", () => ({
  defineSfuPublisher: vi.fn(),
}));

import { defineSfuPublisher } from "@forinda/video-sdk-sfu-livekit";
import { useSfuPublisher } from "@/use-sfu-publisher.ts";

const fakeStream = (): MediaStream =>
  ({
    getTracks: () => [],
    getVideoTracks: () => [],
    getAudioTracks: () => [],
  }) as unknown as MediaStream;

describe("useSfuPublisher (Vue)", () => {
  it("constructs a publisher and auto-starts", async () => {
    const handlers = new Map<string, (...args: unknown[]) => void>();
    const fake = {
      state: "idle",
      peerId: "alice",
      peers: () => [],
      on: vi.fn((event: string, fn: (...args: unknown[]) => void) => {
        handlers.set(event, fn);
        return () => handlers.delete(event);
      }),
      start: vi.fn(async () => handlers.get("state")?.("connected")),
      stop: vi.fn(async () => {}),
      replaceVideoTrack: vi.fn(async () => {}),
      replaceAudioTrack: vi.fn(async () => {}),
    };
    vi.mocked(defineSfuPublisher).mockReturnValue(fake as never);

    const { result, dispose } = withScope(() =>
      useSfuPublisher({
        url: "ws://x",
        token: "t",
        room: "demo",
        peerId: "alice",
        stream: fakeStream(),
      }),
    );

    expect(result.publisher.value).not.toBeNull();
    await Promise.resolve();
    expect(fake.start).toHaveBeenCalled();
    dispose();
  });
});
