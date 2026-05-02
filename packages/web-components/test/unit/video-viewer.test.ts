import { describe, expect, it, vi } from "vitest";
import { ForindaVideoViewer } from "@/elements/video-viewer.ts";

type Listener<T> = (value: T) => void;

interface FakeViewer {
  on(event: string, handler: Listener<unknown>): () => void;
  start(): Promise<void>;
  stop(): Promise<void>;
  emit(event: string, value: unknown): void;
}

function defineFakeViewer(): FakeViewer {
  const handlers = new Map<string, Set<Listener<unknown>>>();
  return {
    on(event, handler) {
      let set = handlers.get(event);
      if (!set) {
        set = new Set();
        handlers.set(event, set);
      }
      set.add(handler);
      return () => set?.delete(handler);
    },
    async start() {},
    async stop() {},
    emit(event, value) {
      handlers.get(event)?.forEach((h) => h(value));
    },
  };
}

function defineFakeSignaling(): { disconnect: ReturnType<typeof vi.fn> } {
  return { disconnect: vi.fn().mockResolvedValue(undefined) };
}

if (!customElements.get(ForindaVideoViewer.tagName)) {
  customElements.define(ForindaVideoViewer.tagName, ForindaVideoViewer);
}

function makeEl(attrs: Record<string, string>): ForindaVideoViewer {
  const el = document.createElement(ForindaVideoViewer.tagName) as ForindaVideoViewer;
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  return el;
}

describe("<forinda-video-viewer>", () => {
  it("renders a shadow DOM with a video part", () => {
    const el = makeEl({});
    expect(el.shadowRoot?.querySelector('video[part="video"]')).not.toBeNull();
  });

  it("requires room, publisher-id, and signaling-url", async () => {
    const cases = [
      { attrs: { "publisher-id": "p", "signaling-url": "wss://x" }, missing: /room/ },
      { attrs: { room: "r", "signaling-url": "wss://x" }, missing: /publisher-id/ },
      { attrs: { room: "r", "publisher-id": "p" }, missing: /signaling-url/ },
    ];
    for (const { attrs, missing } of cases) {
      const el = makeEl(attrs);
      const handler = vi.fn();
      el.addEventListener("error", handler);
      document.body.appendChild(el);
      await Promise.resolve();
      expect(handler).toHaveBeenCalledOnce();
      const detail = (handler.mock.calls[0]?.[0] as CustomEvent<Error>).detail;
      expect(detail.message).toMatch(missing);
      el.remove();
    }
  });

  it("constructs a viewer with the provided publisher-id and ice-servers", async () => {
    const fake = defineFakeViewer();
    const viewerFactory = vi.fn().mockReturnValue(fake);
    const el = makeEl({
      room: "demo",
      "publisher-id": "alice",
      "signaling-url": "wss://x",
      "ice-servers": '[{"urls":"stun:s.example"}]',
    });
    el.overrides = {
      signalingFactory: () => defineFakeSignaling() as unknown as never,
      viewerFactory: viewerFactory as unknown as never,
    };
    document.body.appendChild(el);
    await new Promise<void>((r) => el.addEventListener("ready", () => r(), { once: true }));
    const opts = viewerFactory.mock.calls[0]?.[0];
    expect(opts.room).toBe("demo");
    expect(opts.publisherId).toBe("alice");
    expect(opts.iceServers).toEqual([{ urls: "stun:s.example" }]);
    el.remove();
  });

  it("attaches inbound stream to the video element on track event", async () => {
    const fake = defineFakeViewer();
    const el = makeEl({ room: "r", "publisher-id": "p", "signaling-url": "wss://x" });
    el.overrides = {
      signalingFactory: () => defineFakeSignaling() as unknown as never,
      viewerFactory: () => fake as unknown as never,
    };
    document.body.appendChild(el);
    await new Promise<void>((r) => el.addEventListener("ready", () => r(), { once: true }));

    const stream = { id: "remote" } as unknown as MediaStream;
    const trackHandler = vi.fn();
    el.addEventListener("track", trackHandler);
    fake.emit("track", { stream });

    const video = el.shadowRoot?.querySelector("video") as HTMLVideoElement;
    expect(video.srcObject).toBe(stream);
    expect(el.mediaStream).toBe(stream);
    expect(trackHandler).toHaveBeenCalledOnce();
    el.remove();
  });

  it("emits an error event when the signaling factory throws", async () => {
    const el = makeEl({ room: "r", "publisher-id": "p", "signaling-url": "wss://x" });
    el.overrides = {
      signalingFactory: () => {
        throw new Error("boom");
      },
    };
    const handler = vi.fn();
    el.addEventListener("error", handler);
    document.body.appendChild(el);
    await new Promise<void>((r) => setTimeout(r, 0));
    expect(handler).toHaveBeenCalledOnce();
    expect((handler.mock.calls[0]?.[0] as CustomEvent<Error>).detail.message).toBe("boom");
    el.remove();
  });

  it("tears down on disconnect", async () => {
    const fake = defineFakeViewer();
    const stopSpy = vi.spyOn(fake, "stop");
    const signaling = defineFakeSignaling();
    const el = makeEl({ room: "r", "publisher-id": "p", "signaling-url": "wss://x" });
    el.overrides = {
      signalingFactory: () => signaling as unknown as never,
      viewerFactory: () => fake as unknown as never,
    };
    document.body.appendChild(el);
    await new Promise<void>((r) => el.addEventListener("ready", () => r(), { once: true }));

    el.remove();
    expect(stopSpy).toHaveBeenCalledOnce();
    expect(signaling.disconnect).toHaveBeenCalledOnce();
  });
});
