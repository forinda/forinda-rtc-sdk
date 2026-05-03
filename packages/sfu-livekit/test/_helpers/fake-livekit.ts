/**
 * Hand-rolled `livekit-client` substitute for unit tests. Covers exactly
 * the surface our adapter touches: Room (connect / disconnect / events),
 * LocalParticipant (publishTrack / unpublishTrack), RemoteParticipant
 * (track subscriptions). Keep this minimal — when the adapter starts
 * exercising more LiveKit APIs, expand here, not in test files.
 */

import { vi } from "vitest";

export type RoomEventName =
  | "Connected"
  | "Disconnected"
  | "Reconnecting"
  | "Reconnected"
  | "ParticipantConnected"
  | "ParticipantDisconnected"
  | "TrackSubscribed"
  | "TrackUnsubscribed"
  | "TrackPublished";

interface Listener {
  event: RoomEventName;
  fn: (...args: unknown[]) => void;
}

export interface FakeTrack {
  kind: "video" | "audio";
  mediaStreamTrack: MediaStreamTrack;
}

export interface FakeRemoteParticipant {
  identity: string;
  trackPublications: Map<string, { track: FakeTrack | null }>;
}

export interface FakeLocalParticipant {
  identity: string;
  publishTrack: ReturnType<typeof vi.fn>;
  unpublishTrack: ReturnType<typeof vi.fn>;
}

export interface FakeRoom {
  state: "disconnected" | "connecting" | "connected" | "reconnecting";
  localParticipant: FakeLocalParticipant;
  remoteParticipants: Map<string, FakeRemoteParticipant>;
  connect: ReturnType<typeof vi.fn>;
  disconnect: ReturnType<typeof vi.fn>;
  on: (event: RoomEventName, fn: (...args: unknown[]) => void) => FakeRoom;
  off: (event: RoomEventName, fn: (...args: unknown[]) => void) => FakeRoom;
  /** Test helper — fire an event into the registered listeners. */
  __fire: (event: RoomEventName, ...args: unknown[]) => void;
}

export function defineFakeRoom(localIdentity = "alice"): FakeRoom {
  const listeners: Listener[] = [];
  const room: FakeRoom = {
    state: "disconnected",
    localParticipant: {
      identity: localIdentity,
      publishTrack: vi.fn(async (_track: MediaStreamTrack) => ({
        trackSid: "sid-" + Math.random(),
      })),
      unpublishTrack: vi.fn(async () => {}),
    },
    remoteParticipants: new Map(),
    connect: vi.fn(async () => {
      room.state = "connected";
      for (const l of listeners) if (l.event === "Connected") l.fn();
    }),
    disconnect: vi.fn(async () => {
      room.state = "disconnected";
      for (const l of listeners) if (l.event === "Disconnected") l.fn();
    }),
    on(event, fn) {
      listeners.push({ event, fn });
      return room;
    },
    off(event, fn) {
      const idx = listeners.findIndex((l) => l.event === event && l.fn === fn);
      if (idx >= 0) listeners.splice(idx, 1);
      return room;
    },
    __fire(event, ...args) {
      for (const l of listeners) if (l.event === event) l.fn(...args);
    },
  };
  return room;
}

export function defineFakeRemoteParticipant(identity: string): FakeRemoteParticipant {
  return { identity, trackPublications: new Map() };
}

export function defineFakeTrack(kind: "video" | "audio"): FakeTrack {
  return {
    kind,
    mediaStreamTrack: {
      kind,
      stop: vi.fn(),
    } as unknown as MediaStreamTrack,
  };
}
