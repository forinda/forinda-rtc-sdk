import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@forinda/video-sdk-sfu-livekit", () => ({
  defineSfuViewer: vi.fn(),
}));

import { defineSfuViewer } from "@forinda/video-sdk-sfu-livekit";
import { useSfuViewer } from "@/use-sfu-viewer.ts";

beforeEach(() => {
  vi.mocked(defineSfuViewer).mockReset();
});
afterEach(() => vi.restoreAllMocks());

describe("useSfuViewer", () => {
  it("constructs a viewer and auto-starts", async () => {
    const handlers = new Map<string, (...args: unknown[]) => void>();
    const fake = {
      state: "idle" as const,
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

    const { result } = renderHook(() =>
      useSfuViewer({
        url: "ws://x",
        token: "t",
        room: "demo",
        peerId: "bob",
        publisherId: "alice",
      }),
    );

    await waitFor(() => expect(result.current.viewer).not.toBeNull());
    await waitFor(() => expect(fake.start).toHaveBeenCalled());
  });
});
