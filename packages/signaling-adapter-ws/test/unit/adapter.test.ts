import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { WebSocket as NodeWebSocket } from "ws";
import { defineWebSocketSignalingServer, type WebSocketSignalingServer } from "@/adapter.ts";

let server: WebSocketSignalingServer;
let port: number;

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

const openClient = (sufix = ""): Promise<NodeWebSocket> =>
  new Promise((resolve, reject) => {
    const ws = new NodeWebSocket(`ws://127.0.0.1:${port}${sufix}`);
    ws.once("open", () => resolve(ws));
    ws.once("error", reject);
  });

const collectMessages = (ws: NodeWebSocket): unknown[] => {
  const out: unknown[] = [];
  ws.on("message", (data) => {
    out.push(JSON.parse(data.toString()));
  });
  return out;
};

beforeEach(async () => {
  server = defineWebSocketSignalingServer({ port: 0 });
  // Cast to any to access the underlying address — `port: 0` triggers OS assignment.
  await wait(20); // allow listen to settle
  const addr = server.wss.address();
  if (typeof addr === "string" || addr === null) {
    throw new Error("expected AddressInfo from wss.address()");
  }
  port = addr.port;
});

afterEach(async () => {
  await server.close();
});

describe("defineWebSocketSignalingServer", () => {
  it("requires either wss or port", () => {
    expect(() => defineWebSocketSignalingServer({})).toThrow(/wss.*port/);
  });

  it("starts and accepts a connection", async () => {
    const client = await openClient();
    expect(client.readyState).toBe(NodeWebSocket.OPEN);
    client.close();
  });

  it("routes peer-joined to existing publisher when a viewer joins", async () => {
    const alice = await openClient();
    const aliceMsgs = collectMessages(alice);
    alice.send(JSON.stringify({ type: "join", room: "demo", peer: "alice", role: "publisher" }));
    await wait(50);

    const bob = await openClient();
    const bobMsgs = collectMessages(bob);
    bob.send(JSON.stringify({ type: "join", room: "demo", peer: "bob", role: "viewer" }));
    await wait(80);

    // alice should have seen "peer-joined" for bob
    const sawBob = aliceMsgs.find(
      (m) =>
        typeof m === "object" &&
        m !== null &&
        (m as { type?: string }).type === "peer-joined" &&
        (m as { peer?: string }).peer === "bob",
    );
    expect(sawBob).toBeDefined();

    // bob should have seen "peer-joined" for alice
    const sawAlice = bobMsgs.find(
      (m) =>
        typeof m === "object" &&
        m !== null &&
        (m as { type?: string }).type === "peer-joined" &&
        (m as { peer?: string }).peer === "alice",
    );
    expect(sawAlice).toBeDefined();

    alice.close();
    bob.close();
  });

  it("routes SDP between joined peers", async () => {
    const alice = await openClient();
    alice.send(JSON.stringify({ type: "join", room: "demo", peer: "alice", role: "publisher" }));
    await wait(30);

    const bob = await openClient();
    const bobMsgs = collectMessages(bob);
    bob.send(JSON.stringify({ type: "join", room: "demo", peer: "bob", role: "viewer" }));
    await wait(50);

    alice.send(
      JSON.stringify({
        type: "sdp",
        from: "alice",
        to: "bob",
        sdp: { type: "offer", sdp: "v=0..." },
      }),
    );
    await wait(80);

    const sdp = bobMsgs.find(
      (m) =>
        typeof m === "object" &&
        m !== null &&
        (m as { type?: string }).type === "sdp" &&
        (m as { from?: string }).from === "alice",
    );
    expect(sdp).toBeDefined();

    alice.close();
    bob.close();
  });

  it("broadcasts peer-left on disconnect", async () => {
    const alice = await openClient();
    alice.send(JSON.stringify({ type: "join", room: "demo", peer: "alice", role: "publisher" }));
    await wait(30);

    const bob = await openClient();
    const bobMsgs = collectMessages(bob);
    bob.send(JSON.stringify({ type: "join", room: "demo", peer: "bob", role: "viewer" }));
    await wait(50);

    alice.close();
    await wait(80);

    const sawAliceLeft = bobMsgs.find(
      (m) =>
        typeof m === "object" &&
        m !== null &&
        (m as { type?: string }).type === "peer-left" &&
        (m as { peer?: string }).peer === "alice",
    );
    expect(sawAliceLeft).toBeDefined();

    bob.close();
  });

  it("forwards token from ?token= query into authenticate callback", async () => {
    await server.close();
    let received: string | undefined;
    server = defineWebSocketSignalingServer({
      port: 0,
      authenticate: (token) => {
        received = token;
        return true;
      },
    });
    await wait(20);
    const addr = server.wss.address();
    if (typeof addr === "string" || addr === null) throw new Error();
    port = addr.port;

    const client = await openClient("?token=secret-xyz");
    client.send(JSON.stringify({ type: "join", room: "r", peer: "p", role: "publisher" }));
    await wait(50);
    expect(received).toBe("secret-xyz");
    client.close();
  });
});
