import { afterEach, beforeEach, describe, expect, it } from "vitest";
import express from "express";
import http from "node:http";
import { WebSocket as NodeWebSocket } from "ws";
import { createExpressSignaling, type ExpressSignalingHandle } from "@/adapter.ts";

let httpServer: http.Server;
let signaling: ExpressSignalingHandle;
let port: number;

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

const openClient = (path = "/signaling", suffix = ""): Promise<NodeWebSocket> =>
  new Promise((resolve, reject) => {
    const ws = new NodeWebSocket(`ws://127.0.0.1:${port}${path}${suffix}`);
    ws.once("open", () => resolve(ws));
    ws.once("error", reject);
  });

const collectMessages = (ws: NodeWebSocket): unknown[] => {
  const out: unknown[] = [];
  ws.on("message", (data) => out.push(JSON.parse(data.toString())));
  return out;
};

beforeEach(async () => {
  const app = express();
  httpServer = http.createServer(app);
  signaling = createExpressSignaling({ app, server: httpServer });
  await new Promise<void>((resolve) => httpServer.listen(0, resolve));
  const addr = httpServer.address();
  if (typeof addr === "string" || addr === null) throw new Error();
  port = addr.port;
});

afterEach(async () => {
  await signaling.close();
  await new Promise<void>((resolve) => httpServer.close(() => resolve()));
});

describe("createExpressSignaling", () => {
  it("accepts a connection on the default /signaling path", async () => {
    const ws = await openClient();
    expect(ws.readyState).toBe(NodeWebSocket.OPEN);
    ws.close();
  });

  it("routes peer-joined and SDP between clients", async () => {
    const alice = await openClient();
    alice.send(JSON.stringify({ type: "join", room: "demo", peer: "alice", role: "publisher" }));
    await wait(40);

    const bob = await openClient();
    const bobMsgs = collectMessages(bob);
    bob.send(JSON.stringify({ type: "join", room: "demo", peer: "bob", role: "viewer" }));
    await wait(60);

    alice.send(
      JSON.stringify({
        type: "sdp",
        from: "alice",
        to: "bob",
        sdp: { type: "offer", sdp: "v=0..." },
      }),
    );
    await wait(60);

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

  it("forwards token from ?token= query into authenticate callback", async () => {
    await signaling.close();
    let received: string | undefined;
    const app = express();
    httpServer = http.createServer(app);
    signaling = createExpressSignaling({
      app,
      server: httpServer,
      authenticate: (token) => {
        received = token;
        return true;
      },
    });
    await new Promise<void>((resolve) => httpServer.listen(0, resolve));
    const addr = httpServer.address();
    if (typeof addr === "string" || addr === null) throw new Error();
    port = addr.port;

    const client = await openClient("/signaling", "?token=express-secret");
    client.send(JSON.stringify({ type: "join", room: "r", peer: "p", role: "publisher" }));
    await wait(50);
    expect(received).toBe("express-secret");
    client.close();
  });

  it("custom path option works", async () => {
    await signaling.close();
    const app = express();
    httpServer = http.createServer(app);
    signaling = createExpressSignaling({ app, server: httpServer, path: "/ws" });
    await new Promise<void>((resolve) => httpServer.listen(0, resolve));
    const addr = httpServer.address();
    if (typeof addr === "string" || addr === null) throw new Error();
    port = addr.port;

    const client = await openClient("/ws");
    expect(client.readyState).toBe(NodeWebSocket.OPEN);
    client.close();
  });
});
