import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defineSfuPublisher } from "@/publisher.ts";
import { defineFakeRoom, type FakeRoom } from "../_helpers/fake-livekit.ts";

let fakeRoom: FakeRoom;

const fakeStream = (): MediaStream =>
  ({
    id: "fake-stream",
    getTracks: () => [
      { kind: "video", stop: vi.fn() } as unknown as MediaStreamTrack,
      { kind: "audio", stop: vi.fn() } as unknown as MediaStreamTrack,
    ],
    getVideoTracks: () => [{ kind: "video", stop: vi.fn() } as unknown as MediaStreamTrack],
    getAudioTracks: () => [{ kind: "audio", stop: vi.fn() } as unknown as MediaStreamTrack],
  }) as unknown as MediaStream;

beforeEach(() => {
  fakeRoom = defineFakeRoom("alice");
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("defineSfuPublisher", () => {
  it("starts at idle, transitions through connecting → connected on start()", async () => {
    const pub = defineSfuPublisher({
      url: "ws://test/lk",
      token: "fake.jwt",
      room: "demo",
      peerId: "alice",
      stream: fakeStream(),
      __roomFactory: () => fakeRoom as unknown as never,
    });

    expect(pub.state).toBe("idle");
    const seen: string[] = [];
    pub.on("state", (s) => seen.push(s));

    await pub.start();

    expect(pub.state).toBe("connected");
    expect(seen).toEqual(["connecting", "connected"]);
  });

  it("publishes every track in the supplied stream", async () => {
    const pub = defineSfuPublisher({
      url: "ws://test/lk",
      token: "fake.jwt",
      room: "demo",
      peerId: "alice",
      stream: fakeStream(),
      __roomFactory: () => fakeRoom as unknown as never,
    });
    await pub.start();
    expect(fakeRoom.localParticipant.publishTrack).toHaveBeenCalledTimes(2);
  });

  it("emits viewer-joined when a remote participant connects", async () => {
    const pub = defineSfuPublisher({
      url: "ws://test/lk",
      token: "fake.jwt",
      room: "demo",
      peerId: "alice",
      stream: fakeStream(),
      __roomFactory: () => fakeRoom as unknown as never,
    });
    await pub.start();

    const seen: string[] = [];
    pub.on("viewer-joined", ({ peerId }) => seen.push(peerId));

    fakeRoom.__fire("ParticipantConnected", { identity: "bob" });
    expect(seen).toEqual(["bob"]);
  });

  it("transitions to closed on stop()", async () => {
    const pub = defineSfuPublisher({
      url: "ws://test/lk",
      token: "fake.jwt",
      room: "demo",
      peerId: "alice",
      stream: fakeStream(),
      __roomFactory: () => fakeRoom as unknown as never,
    });
    await pub.start();
    await pub.stop();
    expect(pub.state).toBe("closed");
    expect(fakeRoom.disconnect).toHaveBeenCalled();
  });
});
