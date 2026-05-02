import { describe, expect, it, vi } from "vitest";
import type { ConnectionStats, Publisher, Viewer } from "@forinda/video-sdk-core";
import { useConnectionStats } from "@/use-connection-stats.ts";
import { withScope } from "../_helpers/with-scope.ts";

function fakeSource(): {
  source: Publisher;
  emit: (s: ConnectionStats[]) => void;
  offCalled: () => boolean;
} {
  let offCalled = false;
  let handler: ((s: ConnectionStats[]) => void) | null = null;
  const on = vi.fn((event: string, h: (s: ConnectionStats[]) => void) => {
    if (event === "stats") handler = h;
    return () => {
      offCalled = true;
    };
  });
  return {
    source: { on } as unknown as Publisher,
    emit: (s) => {
      if (handler) handler(s);
    },
    offCalled: () => offCalled,
  };
}

describe("useConnectionStats", () => {
  it("returns null until the source emits", () => {
    const { source } = fakeSource();
    const { result, dispose } = withScope(() => useConnectionStats(source));
    expect(result.value).toBeNull();
    dispose();
  });

  it("updates on stats event", () => {
    const { source, emit } = fakeSource();
    const { result, dispose } = withScope(() => useConnectionStats(source));
    const stats = [{ kind: "outbound" }] as unknown as ConnectionStats[];
    emit(stats);
    expect(result.value).toBe(stats);
    dispose();
  });

  it("unsubscribes on scope dispose", () => {
    const { source, offCalled } = fakeSource();
    const { dispose } = withScope(() => useConnectionStats(source));
    expect(offCalled()).toBe(false);
    dispose();
    expect(offCalled()).toBe(true);
  });

  it("returns inert ref when source is null", () => {
    const { result, dispose } = withScope(() => useConnectionStats(null as Viewer | null));
    expect(result.value).toBeNull();
    dispose();
  });
});
