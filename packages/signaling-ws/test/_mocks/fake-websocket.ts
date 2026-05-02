import { vi } from "vitest";

/**
 * Hand-rolled `WebSocket` substitute for unit tests.
 *
 * Implements the readyState machine + the three event types the SDK uses
 * (`open`, `message`, `close`, `error`). Provides `__open()` / `__message()`
 * / `__close()` / `__error()` for test-driven event firing.
 */

export interface FakeWebSocket extends WebSocket {
  __open(): void;
  __message(data: string): void;
  __close(code?: number, reason?: string): void;
  __error(): void;
}

export interface FakeWebSocketFactoryHandle {
  /** The factory function — pass as `wsFactory` option. */
  factory: (url: string, protocols?: string | string[]) => WebSocket;
  /** All instances created so far, in construction order. */
  instances: FakeWebSocket[];
  /** Most recent instance (for tests that open exactly one). */
  lastInstance(): FakeWebSocket;
}

/**
 * Build a controllable WebSocket factory + instance tracker for tests.
 * Each call to `factory(url, protocols)` constructs a new fake.
 */
export function createFakeWebSocketFactory(): FakeWebSocketFactoryHandle {
  const instances: FakeWebSocket[] = [];

  const factory = (url: string, protocols?: string | string[]): WebSocket => {
    const handlers = new Map<string, Set<EventListener>>();
    let readyState: number = 0; // CONNECTING

    const ws: Partial<FakeWebSocket> = {
      url,
      protocol: Array.isArray(protocols) ? (protocols[0] ?? "") : (protocols ?? ""),
      readyState: readyState as WebSocket["readyState"],
      addEventListener: vi.fn(((event: string, handler: EventListener) => {
        let bucket = handlers.get(event);
        if (bucket === undefined) {
          bucket = new Set();
          handlers.set(event, bucket);
        }
        bucket.add(handler);
      }) as WebSocket["addEventListener"]),
      removeEventListener: vi.fn(((event: string, handler: EventListener) => {
        handlers.get(event)?.delete(handler);
      }) as WebSocket["removeEventListener"]),
      send: vi.fn(),
      close: vi.fn(((code?: number, reason?: string) => {
        if (readyState === 3) return;
        readyState = 2; // CLOSING
        Object.defineProperty(ws, "readyState", { value: 2, configurable: true });
        // simulate async close completion
        queueMicrotask(() => {
          if ((ws as FakeWebSocket).__close !== undefined) {
            (ws as FakeWebSocket).__close(code, reason);
          }
        });
      }) as WebSocket["close"]),

      __open: () => {
        readyState = 1; // OPEN
        Object.defineProperty(ws, "readyState", { value: 1, configurable: true });
        const event = new Event("open");
        handlers.get("open")?.forEach((h) => h(event));
      },
      __message: (data: string) => {
        const event = new MessageEvent("message", { data });
        handlers.get("message")?.forEach((h) => h(event));
      },
      __close: (code = 1000, reason = "") => {
        readyState = 3; // CLOSED
        Object.defineProperty(ws, "readyState", { value: 3, configurable: true });
        const event = new CloseEvent("close", { code, reason, wasClean: code === 1000 });
        handlers.get("close")?.forEach((h) => h(event));
      },
      __error: () => {
        const event = new Event("error");
        handlers.get("error")?.forEach((h) => h(event));
      },
    };

    instances.push(ws as FakeWebSocket);
    return ws as WebSocket;
  };

  return {
    factory,
    instances,
    lastInstance: () => {
      const last = instances[instances.length - 1];
      if (last === undefined) throw new Error("no fake WebSocket instances yet");
      return last;
    },
  };
}
