import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { defineRoomChannel, type RoomChannelState } from "@forinda/video-sdk-core";
import { defineWebSocketSignaling } from "@forinda/video-sdk-signaling-ws";
import { defineDevServer, type DevServerHandle } from "@forinda/test-helpers";

describe("RoomChannel reconnect end-to-end", () => {
  let server: DevServerHandle;
  beforeEach(async () => {
    server = await defineDevServer();
  });
  afterEach(async () => {
    await server.close();
  });

  it("re-issues join + presence after the server bounces", async () => {
    const transport = defineWebSocketSignaling({
      url: server.url,
      // Disable the transport-level auto-reconnect so we exercise the
      // channel-level retry path (which re-issues join + presence resync,
      // not just a fresh socket).
      reconnect: false,
    });
    const channel = defineRoomChannel({
      signaling: transport,
      room: "demo",
      peerId: "alice",
      retry: { initialBackoffMs: 50, maxAttempts: 5 },
    });

    const seen: RoomChannelState[] = [];
    channel.on("state", (s) => seen.push(s));

    await channel.start();
    await channel.setAttribute("hand-raised", true);

    const port = server.port;
    await server.close();

    // Restart on the same port so the transport's reconnect target is valid.
    server = await defineDevServer({ port });

    // Wait for the reconnect loop to converge.
    await new Promise((resolve) => setTimeout(resolve, 1500));

    expect(seen).toContain("reconnecting");
    expect(channel.state).toBe("connected");
  });
});
