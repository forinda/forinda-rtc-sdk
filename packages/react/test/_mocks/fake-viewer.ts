import { vi } from "vitest";
import type { ConnectionStats, ConnectionState, Viewer } from "@forinda/video-sdk-core";

/**
 * Minimal `Viewer` substitute for hook tests.
 */

interface ViewerEventMap {
  state: ConnectionState;
  track: { stream: MediaStream };
  stats: ConnectionStats;
  retry: { attempt: number; nextDelayMs: number; lastError: Error };
  error: Error;
}

export interface FakeViewer extends Viewer {
  __emit<K extends keyof ViewerEventMap>(event: K, payload: ViewerEventMap[K]): void;
}

export function createFakeViewer(
  opts: { peerId?: string; room?: string; publisherId?: string } = {},
): FakeViewer {
  const handlers = new Map<string, Set<(p: unknown) => void>>();
  let state: ConnectionState = "idle";
  let stream: MediaStream | null = null;

  const fake: Partial<FakeViewer> = {
    peerId: opts.peerId ?? "bob",
    room: opts.room ?? "demo",
    publisherId: opts.publisherId ?? "alice",
    get state() {
      return state;
    },
    get stream() {
      return stream;
    },
    on: vi.fn((event: string, handler: (p: unknown) => void) => {
      let bucket = handlers.get(event);
      if (bucket === undefined) {
        bucket = new Set();
        handlers.set(event, bucket);
      }
      bucket.add(handler);
      return () => bucket?.delete(handler);
    }) as Viewer["on"],
    start: vi.fn(async () => {
      state = "connecting";
      handlers.get("state")?.forEach((h) => h("connecting"));
    }),
    stop: vi.fn(async () => {
      state = "closed";
      handlers.get("state")?.forEach((h) => h("closed"));
    }),
    getStats: vi.fn(async () => ({}) as ConnectionStats),
    __emit<K extends keyof ViewerEventMap>(event: K, payload: ViewerEventMap[K]): void {
      if (event === "track") {
        stream = (payload as { stream: MediaStream }).stream;
      }
      if (event === "state") state = payload as ConnectionState;
      handlers.get(event)?.forEach((h) => h(payload));
    },
  };

  return fake as FakeViewer;
}
