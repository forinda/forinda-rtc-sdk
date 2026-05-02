#!/usr/bin/env node
/**
 * Load harness for the Forinda signaling server.
 *
 * Spins up N WebSocket clients per room across R rooms, fans chat at the
 * configured rate, and reports throughput + p50/p95 latency at the end.
 *
 * Usage:
 *   node tools/load-signaling.mjs --url ws://localhost:8787 --rooms 100 --peers 10 --chatPerSec 1 --duration 30
 */

import { performance } from "node:perf_hooks";
import { parseArgs } from "node:util";
import WebSocket from "ws";

const { values } = parseArgs({
  options: {
    url: { type: "string", default: "ws://127.0.0.1:8787" },
    rooms: { type: "string", default: "10" },
    peers: { type: "string", default: "5" },
    chatPerSec: { type: "string", default: "1" },
    duration: { type: "string", default: "10" },
  },
});

const url = values.url;
const numRooms = Number.parseInt(values.rooms, 10);
const peersPerRoom = Number.parseInt(values.peers, 10);
const chatPerSec = Number.parseFloat(values.chatPerSec);
const durationSec = Number.parseInt(values.duration, 10);

const peers = [];
const latenciesMs = [];
let chatsSent = 0;
let chatsReceived = 0;

console.log(
  `[load] connecting ${numRooms * peersPerRoom} peers (${numRooms} rooms × ${peersPerRoom}/room) → ${url}`,
);

await Promise.all(
  Array.from({ length: numRooms }, async (_, roomIdx) => {
    const roomId = `load-${roomIdx}`;
    return Promise.all(
      Array.from({ length: peersPerRoom }, async (_, peerIdx) => {
        const peerId = `${roomId}-p${peerIdx}`;
        const ws = new WebSocket(url);
        await new Promise((resolve, reject) => {
          ws.once("open", resolve);
          ws.once("error", reject);
        });
        ws.send(JSON.stringify({ type: "join", room: roomId, peer: peerId, role: "presence" }));
        ws.on("message", (raw) => {
          const msg = JSON.parse(raw.toString());
          if (msg.type === "chat" && msg.clientId) {
            const sentAt = Number.parseFloat(msg.clientId.split(":")[1] ?? "0");
            if (sentAt > 0) {
              latenciesMs.push(performance.now() - sentAt);
              chatsReceived += 1;
            }
          }
        });
        peers.push({ ws, peerId, roomId });
      }),
    );
  }),
);

console.log(`[load] all peers joined. running for ${durationSec}s at ${chatPerSec} chat/s/peer`);

const start = performance.now();
const interval = setInterval(() => {
  for (const { ws, peerId } of peers) {
    if (ws.readyState !== WebSocket.OPEN) continue;
    ws.send(
      JSON.stringify({
        type: "chat",
        from: peerId,
        body: `hello ${chatsSent}`,
        ts: Date.now(),
        clientId: `${peerId}:${performance.now()}:${chatsSent}`,
      }),
    );
    chatsSent += 1;
  }
}, 1000 / chatPerSec);

await new Promise((resolve) => setTimeout(resolve, durationSec * 1000));
clearInterval(interval);

// Allow trailing fan-out to drain.
await new Promise((resolve) => setTimeout(resolve, 1000));

for (const { ws } of peers) ws.close();

latenciesMs.sort((a, b) => a - b);
const p = (frac) => latenciesMs[Math.floor(latenciesMs.length * frac)] ?? 0;

const elapsedSec = (performance.now() - start) / 1000;
console.log(`[load] sent=${chatsSent} received=${chatsReceived} elapsed=${elapsedSec.toFixed(1)}s`);
console.log(
  `[load] throughput: sent=${(chatsSent / elapsedSec).toFixed(0)}/s received=${(chatsReceived / elapsedSec).toFixed(0)}/s`,
);
console.log(
  `[load] latency ms: p50=${p(0.5).toFixed(1)} p95=${p(0.95).toFixed(1)} p99=${p(0.99).toFixed(1)} max=${p(1).toFixed(1)}`,
);
