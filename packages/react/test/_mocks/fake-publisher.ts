import { vi } from "vitest";
import type { ConnectionStats, ConnectionState, Publisher } from "@forinda/video-sdk-core";

/**
 * Minimal `Publisher` substitute for hook tests. Implements the events the
 * hook subscribes to plus `start`/`stop`/`replaceVideoTrack`/`replaceAudioTrack`
 * stubs. `__emit(event, payload)` lets tests drive state changes.
 */

interface PublisherEventMap {
  state: ConnectionState;
  viewer: { peerId: string };
  "viewer-left": { peerId: string };
  stats: ConnectionStats[];
  retry: { attempt: number; nextDelayMs: number; lastError: Error };
  error: Error;
}

export interface FakePublisher extends Publisher {
  __emit<K extends keyof PublisherEventMap>(event: K, payload: PublisherEventMap[K]): void;
}

export function createFakePublisher(opts: { peerId?: string; room?: string } = {}): FakePublisher {
  const handlers = new Map<string, Set<(p: unknown) => void>>();
  let state: ConnectionState = "idle";
  const viewers: string[] = [];

  const fake: Partial<FakePublisher> = {
    peerId: opts.peerId ?? "alice",
    room: opts.room ?? "demo",
    get state() {
      return state;
    },
    peers: vi.fn(() => [...viewers]),
    on: vi.fn((event: string, handler: (p: unknown) => void) => {
      let bucket = handlers.get(event);
      if (bucket === undefined) {
        bucket = new Set();
        handlers.set(event, bucket);
      }
      bucket.add(handler);
      return () => bucket?.delete(handler);
    }) as Publisher["on"],
    start: vi.fn(async () => {
      state = "connecting";
      handlers.get("state")?.forEach((h) => h("connecting"));
      state = "connected";
      handlers.get("state")?.forEach((h) => h("connected"));
    }),
    stop: vi.fn(async () => {
      state = "closed";
      handlers.get("state")?.forEach((h) => h("closed"));
    }),
    replaceVideoTrack: vi.fn(async () => undefined),
    replaceAudioTrack: vi.fn(async () => undefined),
    getStats: vi.fn(async () => []),
    __emit<K extends keyof PublisherEventMap>(event: K, payload: PublisherEventMap[K]): void {
      if (event === "viewer") {
        viewers.push((payload as { peerId: string }).peerId);
      } else if (event === "viewer-left") {
        const idx = viewers.indexOf((payload as { peerId: string }).peerId);
        if (idx !== -1) viewers.splice(idx, 1);
      }
      if (event === "state") state = payload as ConnectionState;
      handlers.get(event)?.forEach((h) => h(payload));
    },
  };

  return fake as FakePublisher;
}
