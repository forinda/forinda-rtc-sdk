import { describe, expect, it, vi } from "vitest";
import { defineSfuPublisher } from "@/publisher.ts";
import { defineSfuViewer } from "@/viewer.ts";
import { SfuError } from "@/errors.ts";
import { defineFakeRoom } from "../_helpers/fake-livekit.ts";

const fakeStream = (): MediaStream =>
  ({
    getTracks: () => [],
    getVideoTracks: () => [],
    getAudioTracks: () => [],
  }) as unknown as MediaStream;

describe("SFU lifecycle — error mapping", () => {
  it("maps LiveKit token errors to sfu_token_invalid", async () => {
    const fakeRoom = defineFakeRoom("alice");
    fakeRoom.connect = vi.fn(async () => {
      throw new Error("invalid token");
    });

    const pub = defineSfuPublisher({
      url: "ws://test/lk",
      token: "bad.jwt",
      room: "demo",
      peerId: "alice",
      stream: fakeStream(),
      __roomFactory: () => fakeRoom as unknown as never,
    });

    await expect(pub.start()).rejects.toMatchObject({
      code: "sfu_token_invalid",
    });
    expect(pub.state).toBe("closed");
  });

  it("maps generic connect failures to sfu_connect_failed", async () => {
    const fakeRoom = defineFakeRoom("bob");
    fakeRoom.connect = vi.fn(async () => {
      throw new Error("network unreachable");
    });

    const viewer = defineSfuViewer({
      url: "ws://test/lk",
      token: "ok.jwt",
      room: "demo",
      peerId: "bob",
      publisherId: "alice",
      __roomFactory: () => fakeRoom as unknown as never,
    });

    await expect(viewer.start()).rejects.toMatchObject({
      code: "sfu_connect_failed",
    });
  });

  it("emits sfu_disconnected when the room drops mid-session", async () => {
    const fakeRoom = defineFakeRoom("alice");
    const pub = defineSfuPublisher({
      url: "ws://test/lk",
      token: "ok.jwt",
      room: "demo",
      peerId: "alice",
      stream: fakeStream(),
      __roomFactory: () => fakeRoom as unknown as never,
    });

    await pub.start();

    const errors: SfuError[] = [];
    pub.on("error", (e) => errors.push(e as SfuError));

    fakeRoom.__fire("Disconnected");

    expect(errors).toHaveLength(1);
    expect(errors[0]?.code).toBe("sfu_disconnected");
    expect(pub.state).toBe("closed");
  });
});
