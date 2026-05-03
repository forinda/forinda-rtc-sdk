import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defineSfuViewer } from "@/viewer.ts";
import {
  defineFakeRemoteParticipant,
  defineFakeRoom,
  defineFakeTrack,
  type FakeRoom,
} from "../_helpers/fake-livekit.ts";

let fakeRoom: FakeRoom;

beforeEach(() => {
  fakeRoom = defineFakeRoom("bob");
});
afterEach(() => vi.restoreAllMocks());

describe("defineSfuViewer", () => {
  it("starts at idle, connects on start()", async () => {
    const viewer = defineSfuViewer({
      url: "ws://test/lk",
      token: "fake.jwt",
      room: "demo",
      peerId: "bob",
      publisherId: "alice",
      __roomFactory: () => fakeRoom as unknown as never,
    });

    expect(viewer.state).toBe("idle");
    await viewer.start();
    expect(viewer.state).toBe("connected");
  });

  it("emits track only for the named publisher", async () => {
    const viewer = defineSfuViewer({
      url: "ws://test/lk",
      token: "fake.jwt",
      room: "demo",
      peerId: "bob",
      publisherId: "alice",
      __roomFactory: () => fakeRoom as unknown as never,
    });

    const events: string[] = [];
    viewer.on("track", () => events.push("track"));

    await viewer.start();

    const aliceVideo = defineFakeTrack("video");
    const carolVideo = defineFakeTrack("video");
    fakeRoom.__fire(
      "TrackSubscribed",
      aliceVideo,
      { trackSid: "sid-alice" },
      defineFakeRemoteParticipant("alice"),
    );
    fakeRoom.__fire(
      "TrackSubscribed",
      carolVideo,
      { trackSid: "sid-carol" },
      defineFakeRemoteParticipant("carol"),
    );

    expect(events).toEqual(["track"]);
    expect(viewer.stream).not.toBeNull();
    expect(viewer.stream?.getVideoTracks().length).toBe(1);
  });

  it("transitions to closed on stop()", async () => {
    const viewer = defineSfuViewer({
      url: "ws://test/lk",
      token: "fake.jwt",
      room: "demo",
      peerId: "bob",
      publisherId: "alice",
      __roomFactory: () => fakeRoom as unknown as never,
    });
    await viewer.start();
    await viewer.stop();
    expect(viewer.state).toBe("closed");
    expect(fakeRoom.disconnect).toHaveBeenCalled();
  });
});
