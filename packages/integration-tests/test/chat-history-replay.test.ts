import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { defineRoomChannel } from "@forinda/video-sdk-core";
import { defineWebSocketSignaling } from "@forinda/video-sdk-signaling-ws";
import { defineDevServer, type DevServerHandle } from "@forinda/test-helpers";

describe("Chat history replay end-to-end", () => {
  let server: DevServerHandle;
  beforeEach(async () => {
    server = await defineDevServer({ chatHistoryPerRoom: 5 });
  });
  afterEach(async () => {
    await server.close();
  });

  it("late joiner with replayHistory: true sees prior chats", async () => {
    const aliceT = defineWebSocketSignaling({ url: server.url });
    const alice = defineRoomChannel({ signaling: aliceT, room: "demo", peerId: "alice" });
    await alice.start();
    await alice.sendChat("first");
    await alice.sendChat("second");

    const bobT = defineWebSocketSignaling({ url: server.url });
    const bob = defineRoomChannel({
      signaling: bobT,
      room: "demo",
      peerId: "bob",
      replayHistory: true,
    });
    await bob.start();

    // Allow the engine to fan out chat-history.
    await new Promise((resolve) => setTimeout(resolve, 200));

    expect(bob.chatHistory.map((m) => m.body)).toEqual(["first", "second"]);

    await alice.stop();
    await bob.stop();
  });
});
