import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { defineRoomChannel } from "@/room/room-channel.ts";
import type { RoomChannelState } from "@/room/types.ts";
import { defineEngineFixture, type EngineFixture } from "@forinda/test-helpers";

describe("RoomChannel — state lifecycle (EPIC-20)", () => {
  let fx: EngineFixture;
  beforeEach(() => {
    fx = defineEngineFixture();
  });
  afterEach(async () => {
    await fx.closeAll();
  });

  it("starts at idle, transitions to connecting → connected on start()", async () => {
    const transport = await fx.open("sa");
    const channel = defineRoomChannel({
      signaling: transport,
      room: "demo",
      peerId: "alice",
    });
    expect(channel.state).toBe("idle");

    const seen: RoomChannelState[] = [];
    channel.on("state", (s) => seen.push(s));

    await channel.start();

    expect(channel.state).toBe("connected");
    expect(seen).toEqual(["connecting", "connected"]);
  });

  it("transitions to closed on stop()", async () => {
    const transport = await fx.open("sa");
    const channel = defineRoomChannel({
      signaling: transport,
      room: "demo",
      peerId: "alice",
    });
    await channel.start();

    const seen: RoomChannelState[] = [];
    channel.on("state", (s) => seen.push(s));

    await channel.stop();

    expect(channel.state).toBe("closed");
    expect(seen).toEqual(["closed"]);
  });
});
