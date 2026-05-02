import { afterEach, describe, expect, it } from "vitest";
import { WebSocket as NodeWebSocket } from "ws";
import { DEFAULT_PORT, defineSignalingServer } from "@/server.ts";
import type { WebSocketSignalingServer } from "@forinda/video-sdk-signaling-adapter-ws";

let server: WebSocketSignalingServer | undefined;

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

afterEach(async () => {
  if (server !== undefined) {
    await server.close();
    server = undefined;
  }
});

describe("defineSignalingServer", () => {
  it("starts on a random port (port: 0)", async () => {
    server = defineSignalingServer({ port: 0 });
    await wait(20);
    const addr = server.wss.address();
    if (typeof addr === "string" || addr === null) throw new Error();
    expect(addr.port).toBeGreaterThan(0);
  });

  it("DEFAULT_PORT is 3000", () => {
    expect(DEFAULT_PORT).toBe(3000);
  });

  it("accepts a real WebSocket client and routes a join", async () => {
    server = defineSignalingServer({ port: 0 });
    await wait(20);
    const addr = server.wss.address();
    if (typeof addr === "string" || addr === null) throw new Error();
    const port = addr.port;

    const ws = new NodeWebSocket(`ws://127.0.0.1:${port}`);
    await new Promise<void>((resolve, reject) => {
      ws.once("open", () => resolve());
      ws.once("error", reject);
    });

    expect(ws.readyState).toBe(NodeWebSocket.OPEN);
    ws.send(JSON.stringify({ type: "join", room: "demo", peer: "alice", role: "publisher" }));
    await wait(40);

    expect(server.session.rooms()[0]?.peers[0]?.peerId).toBe("alice");
    ws.close();
  });

  it("forwards authenticate option through to the engine", async () => {
    let receivedToken: string | undefined;
    let receivedRoom: string | undefined;
    server = defineSignalingServer({
      port: 0,
      authenticate: (token, room) => {
        receivedToken = token;
        receivedRoom = room;
        return true;
      },
    });
    await wait(20);
    const addr = server.wss.address();
    if (typeof addr === "string" || addr === null) throw new Error();
    const port = addr.port;

    const ws = new NodeWebSocket(`ws://127.0.0.1:${port}?token=abc`);
    await new Promise<void>((resolve, reject) => {
      ws.once("open", () => resolve());
      ws.once("error", reject);
    });
    ws.send(JSON.stringify({ type: "join", room: "demo", peer: "alice", role: "publisher" }));
    await wait(40);

    expect(receivedToken).toBe("abc");
    expect(receivedRoom).toBe("demo");
    ws.close();
  });
});
