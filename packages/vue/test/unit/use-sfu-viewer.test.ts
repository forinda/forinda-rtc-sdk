import { describe, expect, it, vi } from "vitest";
import { withScope } from "../_helpers/with-scope.ts";

vi.mock("@forinda/video-sdk-sfu-livekit", () => ({
  defineSfuViewer: vi.fn(),
}));

import { defineSfuViewer } from "@forinda/video-sdk-sfu-livekit";
import { useSfuViewer } from "@/use-sfu-viewer.ts";

describe("useSfuViewer (Vue)", () => {
  it("constructs a viewer and auto-starts", async () => {
    const handlers = new Map<string, (...args: unknown[]) => void>();
    const fake = {
      state: "idle",
      peerId: "bob",
      stream: null,
      on: vi.fn((event: string, fn: (...args: unknown[]) => void) => {
        handlers.set(event, fn);
        return () => handlers.delete(event);
      }),
      start: vi.fn(async () => handlers.get("state")?.("connected")),
      stop: vi.fn(async () => {}),
    };
    vi.mocked(defineSfuViewer).mockReturnValue(fake as never);

    const { result, dispose } = withScope(() =>
      useSfuViewer({
        url: "ws://x",
        token: "t",
        room: "demo",
        peerId: "bob",
        publisherId: "alice",
      }),
    );

    expect(result.viewer.value).not.toBeNull();
    await Promise.resolve();
    expect(fake.start).toHaveBeenCalled();
    dispose();
  });
});
