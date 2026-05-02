import { vi } from "vitest";

/**
 * Install a fake `navigator.mediaDevices` for the current test. Returns the
 * spies so individual tests can configure responses per call.
 *
 * jsdom does not implement MediaDevices; this stub makes `getUserMedia`,
 * `enumerateDevices`, and the `devicechange` event observable.
 */
export function installFakeMediaDevices(): {
  getUserMedia: ReturnType<typeof vi.fn>;
  getDisplayMedia: ReturnType<typeof vi.fn>;
  enumerateDevices: ReturnType<typeof vi.fn>;
  fireDeviceChange: () => void;
  cleanup: () => void;
} {
  const getUserMedia = vi.fn<(c: MediaStreamConstraints) => Promise<MediaStream>>();
  const getDisplayMedia = vi.fn<(c: DisplayMediaStreamOptions) => Promise<MediaStream>>();
  const enumerateDevices = vi.fn<() => Promise<MediaDeviceInfo[]>>();
  const listeners = new Set<() => void>();

  const fake: Partial<MediaDevices> & {
    getDisplayMedia: (c: DisplayMediaStreamOptions) => Promise<MediaStream>;
  } = {
    getUserMedia,
    getDisplayMedia,
    enumerateDevices,
    addEventListener: ((event: string, handler: EventListener) => {
      if (event === "devicechange") listeners.add(handler as () => void);
    }) as MediaDevices["addEventListener"],
    removeEventListener: ((event: string, handler: EventListener) => {
      if (event === "devicechange") listeners.delete(handler as () => void);
    }) as MediaDevices["removeEventListener"],
  };

  const original = (navigator as Navigator & { mediaDevices?: MediaDevices }).mediaDevices;
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: fake,
  });

  return {
    getUserMedia,
    getDisplayMedia,
    enumerateDevices,
    fireDeviceChange: () => {
      for (const listener of listeners) listener();
    },
    cleanup: () => {
      if (original === undefined) {
        Reflect.deleteProperty(navigator, "mediaDevices");
      } else {
        Object.defineProperty(navigator, "mediaDevices", {
          configurable: true,
          value: original,
        });
      }
    },
  };
}

/**
 * Build a fake MediaStream with controllable tracks. jsdom doesn't supply
 * MediaStream either, so we stub just enough to satisfy our wrappers.
 */
export function fakeMediaStream(
  trackKinds: ("audio" | "video")[] = ["audio", "video"],
): MediaStream {
  const tracks = trackKinds.map((kind) => ({
    kind,
    id: `${kind}-${Math.random().toString(36).slice(2, 8)}`,
    stop: vi.fn(),
  })) as unknown as MediaStreamTrack[];

  return {
    getTracks: () => tracks,
    getVideoTracks: () => tracks.filter((t) => t.kind === "video"),
    getAudioTracks: () => tracks.filter((t) => t.kind === "audio"),
  } as unknown as MediaStream;
}
