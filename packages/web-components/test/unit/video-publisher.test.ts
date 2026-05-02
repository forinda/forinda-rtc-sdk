import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ForindaVideoPublisher } from "@/elements/video-publisher.ts";

type Listener<T> = (value: T) => void;

interface FakePublisher {
  on(event: string, handler: Listener<unknown>): () => void;
  start(): Promise<void>;
  stop(): Promise<void>;
  emit(event: string, value: unknown): void;
}

function defineFakePublisher(): FakePublisher {
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

function defineFakeStream(): MediaStream {
  const tracks: MediaStreamTrack[] = [
    { stop: vi.fn() } as unknown as MediaStreamTrack,
    { stop: vi.fn() } as unknown as MediaStreamTrack,
  ];
  return {
    getTracks: () => tracks,
    id: "fake-stream",
  } as unknown as MediaStream;
}

if (!customElements.get(ForindaVideoPublisher.tagName)) {
  customElements.define(ForindaVideoPublisher.tagName, ForindaVideoPublisher);
}

function makeEl(attrs: Record<string, string | true>): ForindaVideoPublisher {
  const el = document.createElement(ForindaVideoPublisher.tagName) as ForindaVideoPublisher;
  for (const [k, v] of Object.entries(attrs)) {
    el.setAttribute(k, v === true ? "" : v);
  }
  return el;
}

describe("<forinda-video-publisher>", () => {
  let originalMediaDevices: PropertyDescriptor | undefined;

  beforeEach(() => {
    originalMediaDevices = Object.getOwnPropertyDescriptor(navigator, "mediaDevices");
  });

  afterEach(() => {
    if (originalMediaDevices) {
      Object.defineProperty(navigator, "mediaDevices", originalMediaDevices);
    }
  });

  it("renders a shadow DOM with a video element exposed as ::part(video)", () => {
    const el = makeEl({});
    const video = el.shadowRoot?.querySelector("video");
    expect(video).not.toBeNull();
    expect(video?.getAttribute("part")).toBe("video");
  });

  it("emits an error when 'room' attribute is missing", async () => {
    const el = makeEl({ "signaling-url": "wss://example" });
    const handler = vi.fn();
    el.addEventListener("error", handler);
    document.body.appendChild(el);
    await Promise.resolve();
    expect(handler).toHaveBeenCalledOnce();
    const detail = (handler.mock.calls[0]?.[0] as CustomEvent<Error>).detail;
    expect(detail.message).toMatch(/room/);
    el.remove();
  });

  it("emits an error when 'signaling-url' attribute is missing", async () => {
    const el = makeEl({ room: "demo" });
    const handler = vi.fn();
    el.addEventListener("error", handler);
    document.body.appendChild(el);
    await Promise.resolve();
    expect(handler).toHaveBeenCalledOnce();
    const detail = (handler.mock.calls[0]?.[0] as CustomEvent<Error>).detail;
    expect(detail.message).toMatch(/signaling-url/);
    el.remove();
  });

  it("requests audio+video by default and constructs publisher with overrides", async () => {
    const stream = defineFakeStream();
    const getUserMedia = vi.fn().mockResolvedValue(stream);
    const signaling = defineFakeSignaling();
    const signalingFactory = vi.fn().mockReturnValue(signaling);
    const fake = defineFakePublisher();
    const publisherFactory = vi.fn().mockReturnValue(fake);

    const el = makeEl({ room: "demo", "signaling-url": "wss://x" });
    el.overrides = { getUserMedia, signalingFactory, publisherFactory };

    const ready = new Promise<CustomEvent>((resolve) =>
      el.addEventListener("ready", (ev) => resolve(ev as CustomEvent), { once: true }),
    );
    document.body.appendChild(el);
    await ready;

    expect(getUserMedia).toHaveBeenCalledWith({ audio: true, video: true });
    expect(signalingFactory).toHaveBeenCalledWith("wss://x");
    expect(publisherFactory).toHaveBeenCalledOnce();
    const opts = publisherFactory.mock.calls[0]?.[0];
    expect(opts.signaling).toBe(signaling);
    expect(opts.room).toBe("demo");
    expect(opts.stream).toBe(stream);
    expect(opts.iceServers).toEqual([]);

    el.remove();
  });

  it("respects audio-only / video-only attribute selection", async () => {
    const getUserMedia = vi.fn().mockResolvedValue(defineFakeStream());
    const el = makeEl({ room: "r", "signaling-url": "wss://x", audio: true });
    el.overrides = {
      getUserMedia,
      signalingFactory: () => defineFakeSignaling() as unknown as never,
      publisherFactory: () => defineFakePublisher() as unknown as never,
    };
    document.body.appendChild(el);
    await new Promise<void>((r) => el.addEventListener("ready", () => r(), { once: true }));
    expect(getUserMedia).toHaveBeenCalledWith({ audio: true, video: false });
    el.remove();
  });

  it("parses ice-servers JSON attribute", async () => {
    const publisherFactory = vi.fn().mockReturnValue(defineFakePublisher());
    const el = makeEl({
      room: "r",
      "signaling-url": "wss://x",
      "ice-servers": '[{"urls":"stun:stun.example"}]',
    });
    el.overrides = {
      getUserMedia: () => Promise.resolve(defineFakeStream()),
      signalingFactory: () => defineFakeSignaling() as unknown as never,
      publisherFactory: publisherFactory as unknown as never,
    };
    document.body.appendChild(el);
    await new Promise<void>((r) => el.addEventListener("ready", () => r(), { once: true }));
    expect(publisherFactory.mock.calls[0]?.[0].iceServers).toEqual([{ urls: "stun:stun.example" }]);
    el.remove();
  });

  it("forwards publisher events as host CustomEvents", async () => {
    const fake = defineFakePublisher();
    const el = makeEl({ room: "r", "signaling-url": "wss://x" });
    el.overrides = {
      getUserMedia: () => Promise.resolve(defineFakeStream()),
      signalingFactory: () => defineFakeSignaling() as unknown as never,
      publisherFactory: () => fake as unknown as never,
    };

    const stateHandler = vi.fn();
    const viewerHandler = vi.fn();
    el.addEventListener("state", stateHandler);
    el.addEventListener("viewer", viewerHandler);

    document.body.appendChild(el);
    await new Promise<void>((r) => el.addEventListener("ready", () => r(), { once: true }));

    fake.emit("state", "connected");
    fake.emit("viewer", { peerId: "alice" });

    expect(stateHandler).toHaveBeenCalledOnce();
    expect((stateHandler.mock.calls[0]?.[0] as CustomEvent).detail).toBe("connected");
    expect((viewerHandler.mock.calls[0]?.[0] as CustomEvent).detail).toEqual({
      peerId: "alice",
    });
    el.remove();
  });

  it("emits an error event when getUserMedia rejects", async () => {
    const el = makeEl({ room: "r", "signaling-url": "wss://x" });
    el.overrides = {
      getUserMedia: () => Promise.reject("denied"),
    };
    const handler = vi.fn();
    el.addEventListener("error", handler);
    document.body.appendChild(el);
    await new Promise<void>((r) => setTimeout(r, 0));
    expect(handler).toHaveBeenCalledOnce();
    const detail = (handler.mock.calls[0]?.[0] as CustomEvent<Error>).detail;
    expect(detail).toBeInstanceOf(Error);
    expect(detail.message).toBe("denied");
    el.remove();
  });

  it("uses getDisplayMedia when source='screen'", async () => {
    const stream = defineFakeStream();
    const getUserMedia = vi.fn();
    const getDisplayMedia = vi.fn().mockResolvedValue(stream);
    const fake = defineFakePublisher();

    const el = makeEl({ room: "r", "signaling-url": "wss://x", source: "screen" });
    el.overrides = {
      getUserMedia,
      getDisplayMedia,
      signalingFactory: () => defineFakeSignaling() as unknown as never,
      publisherFactory: () => fake as unknown as never,
    };
    document.body.appendChild(el);
    await new Promise<void>((r) => el.addEventListener("ready", () => r(), { once: true }));

    expect(getDisplayMedia).toHaveBeenCalledWith({ audio: false, video: true });
    expect(getUserMedia).not.toHaveBeenCalled();
    el.remove();
  });

  it("opts into screen audio when share-audio attribute is present", async () => {
    const stream = defineFakeStream();
    const getDisplayMedia = vi.fn().mockResolvedValue(stream);
    const fake = defineFakePublisher();

    const el = makeEl({
      room: "r",
      "signaling-url": "wss://x",
      source: "screen",
      "share-audio": true,
    });
    el.overrides = {
      getDisplayMedia,
      signalingFactory: () => defineFakeSignaling() as unknown as never,
      publisherFactory: () => fake as unknown as never,
    };
    document.body.appendChild(el);
    await new Promise<void>((r) => el.addEventListener("ready", () => r(), { once: true }));

    expect(getDisplayMedia).toHaveBeenCalledWith({ audio: true, video: true });
    el.remove();
  });

  it("tears down on disconnect: stops tracks, disconnects signaling, stops publisher", async () => {
    const stream = defineFakeStream();
    const fake = defineFakePublisher();
    const stopSpy = vi.spyOn(fake, "stop");
    const signaling = defineFakeSignaling();

    const el = makeEl({ room: "r", "signaling-url": "wss://x" });
    el.overrides = {
      getUserMedia: () => Promise.resolve(stream),
      signalingFactory: () => signaling as unknown as never,
      publisherFactory: () => fake as unknown as never,
    };
    document.body.appendChild(el);
    await new Promise<void>((r) => el.addEventListener("ready", () => r(), { once: true }));

    el.remove();

    expect(stopSpy).toHaveBeenCalledOnce();
    expect(signaling.disconnect).toHaveBeenCalledOnce();
    for (const t of stream.getTracks()) {
      expect(t.stop).toHaveBeenCalledOnce();
    }
  });
});
