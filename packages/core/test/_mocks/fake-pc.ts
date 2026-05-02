import { vi } from "vitest";

/**
 * Hand-rolled `RTCPeerConnection` substitute for unit tests.
 *
 * Surface chosen to match what the SDK actually uses — not the entire
 * browser API. Emits the four state events the wrapper subscribes to:
 * `connectionstatechange`, `iceconnectionstatechange`, `icecandidate`,
 * `track`.
 */

export type FakePCEvent =
  | "connectionstatechange"
  | "iceconnectionstatechange"
  | "icecandidate"
  | "track";

export interface FakePeerConnection extends RTCPeerConnection {
  /** Fire one of the events the wrapper listens for. Test-only. */
  __fire(event: FakePCEvent, payload?: unknown): void;
  /** Manually set state fields. Test-only. */
  __setState(partial: {
    connectionState?: RTCPeerConnectionState;
    iceConnectionState?: RTCIceConnectionState;
    signalingState?: RTCSignalingState;
  }): void;
}

export function createFakePeerConnection(): FakePeerConnection {
  const handlers = new Map<FakePCEvent, Set<EventListener>>();
  let connectionState: RTCPeerConnectionState = "new";
  let iceConnectionState: RTCIceConnectionState = "new";
  let signalingState: RTCSignalingState = "stable";

  const pc: Partial<FakePeerConnection> = {
    addEventListener: vi.fn(((event: string, handler: EventListener) => {
      const key = event as FakePCEvent;
      let bucket = handlers.get(key);
      if (bucket === undefined) {
        bucket = new Set();
        handlers.set(key, bucket);
      }
      bucket.add(handler);
    }) as RTCPeerConnection["addEventListener"]),

    removeEventListener: vi.fn(((event: string, handler: EventListener) => {
      handlers.get(event as FakePCEvent)?.delete(handler);
    }) as RTCPeerConnection["removeEventListener"]),

    close: vi.fn(() => {
      connectionState = "closed";
      iceConnectionState = "closed";
      signalingState = "closed";
    }),

    addTrack: vi.fn(),
    getSenders: vi.fn(() => []),
    getReceivers: vi.fn(() => []),
    getStats: vi.fn(async () => new Map() as RTCStatsReport),

    // RTCPeerConnection.createOffer/createAnswer have legacy callback overloads
    // that confuse TS overload resolution; cast through unknown.
    createOffer: vi.fn(
      async () => ({ type: "offer", sdp: "v=0...offer" }) as RTCSessionDescriptionInit,
    ) as unknown as RTCPeerConnection["createOffer"],
    createAnswer: vi.fn(
      async () => ({ type: "answer", sdp: "v=0...answer" }) as RTCSessionDescriptionInit,
    ) as unknown as RTCPeerConnection["createAnswer"],
    setLocalDescription: vi.fn(async () => undefined),
    setRemoteDescription: vi.fn(async () => undefined),
    addIceCandidate: vi.fn(async () => undefined),
    restartIce: vi.fn(),

    get connectionState() {
      return connectionState;
    },
    get iceConnectionState() {
      return iceConnectionState;
    },
    get signalingState() {
      return signalingState;
    },

    __fire(event: FakePCEvent, payload?: unknown): void {
      const fakeEvent = (payload ?? new Event(event)) as Event;
      handlers.get(event)?.forEach((h) => h(fakeEvent));
    },
    __setState(partial): void {
      if (partial.connectionState) connectionState = partial.connectionState;
      if (partial.iceConnectionState) iceConnectionState = partial.iceConnectionState;
      if (partial.signalingState) signalingState = partial.signalingState;
    },
  };

  return pc as FakePeerConnection;
}
