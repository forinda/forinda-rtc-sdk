# Patterns

End-to-end recipes that span multiple packages. Pick the one closest to your use case and adapt.

---

## Pattern 1: Webinar (1 publisher → N viewers + chat + recording)

**Use case:** one host streams to a room of viewers; everyone can chat; the host (or a backend) saves the session to a file.

**Packages involved:** `core`, `signaling-ws`, `react` (or `vue` / `elements`).

```ts
import { defineRoom } from "@forinda/video-sdk-core";
import { defineWebSocketSignaling } from "@forinda/video-sdk-signaling-ws";

// Host side
const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
const signaling = defineWebSocketSignaling({ url: "wss://signal.example.com" });
const room = defineRoom({ signaling, room: "webinar-2026", peerId: "host" });

const publisher = room.publisher({ stream });
const channel = room.channel(); // presence + chat over the same socket
const recorder = room.recorder(stream, { timesliceMs: 1000 });

await publisher.start();
await channel.start();
recorder.start();

// Stream chunks straight to the backend instead of buffering everything in memory.
const uploader = defineUploader({ url: "/api/uploads/" + crypto.randomUUID() });
recorder.pipeTo(uploader);
```

```ts
// Viewer side (much smaller — viewers only consume + chat)
const signaling = defineWebSocketSignaling({ url: "wss://signal.example.com" });
const room = defineRoom({ signaling, room: "webinar-2026", peerId: viewerId });

const viewer = room.viewer({ publisherId: "host" });
const channel = room.channel();

viewer.on("track", ({ stream }) => {
  document.querySelector("video").srcObject = stream;
});
await viewer.start();
await channel.start();
```

**Why one `Room` instead of separate transports?** Without `defineRoom`, the publisher and the channel would each issue a `join` on the same socket — the engine treats the second join as a peer rebinding and silently overwrites the first, breaking media negotiation. `Room.publisher()` / `Room.channel()` share the single coordinated join.

**Server-side rate limits + history (recommended for production):**

```ts
import { defineSignalingServer } from "@forinda/video-sdk-signaling-server";

defineSignalingServer({
  port: 8787,
  rateLimit: { chatPerSec: 5, presenceUpdatesPerSec: 10 },
  chatHistoryPerRoom: 200,
});
```

Late joiners can request the chat replay with `defineRoomChannel({ replayHistory: true })`.

---

## Pattern 2: Small meeting (mesh — N publishers, everyone subscribes to everyone)

**Use case:** 2-8 person video call, no central media server. Each peer publishes their own camera AND subscribes to every other publisher.

**Packages involved:** `core`, `signaling-ws`, plus an adapter for your UI.

```ts
import { defineRoom, definePublisher, defineViewer } from "@forinda/video-sdk-core";
import { defineWebSocketSignaling } from "@forinda/video-sdk-signaling-ws";

const myStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
const signaling = defineWebSocketSignaling({ url: "wss://signal.example.com" });
const room = defineRoom({ signaling, room: "team-standup", peerId: myPeerId });

// Always publish.
const publisher = room.publisher({ stream: myStream });
await publisher.start();

// Spin up a viewer for each other peer that joins.
const viewers = new Map<string, ReturnType<typeof room.viewer>>();
const channel = room.channel();

channel.on("peer-joined", async ({ peer }) => {
  if (peer === myPeerId) return;
  if (viewers.has(peer)) return;
  const v = room.viewer({ publisherId: peer });
  viewers.set(peer, v);
  v.on("track", ({ stream }) => attachVideoEl(peer, stream));
  await v.start();
});

channel.on("peer-left", async ({ peer }) => {
  const v = viewers.get(peer);
  if (v) {
    await v.stop();
    viewers.delete(peer);
  }
});

await channel.start();
```

**Where the mesh ceiling kicks in:** each publisher uploads N-1 copies of its stream (one per other viewer). On a typical home connection (~5-10 Mbps upstream) that breaks down past ~6-8 peers per room. For larger groups you need an SFU — see EPIC-14 on the roadmap.

**Stats per peer:** wrap each viewer in `useConnectionStats` (React/Vue) or call `viewer.on("stats", ...)` directly. The poll interval is configurable per viewer.

---

## Pattern 3: Custom signaling backend

**Use case:** you already run a WebSocket server (or Server-Sent Events, or a message bus) and want to skip `signaling-server` / `signaling-adapter-*` entirely. Or you want media + presence + chat to flow over your own auth-aware transport.

**Packages involved:** `signaling-protocol` (zod schemas + `Session`) on the server, `core`'s `SignalingTransport` interface on the browser.

### Server side: wire `Session` into your transport

```ts
import { defineSession, SignalingMessage } from "@forinda/video-sdk-signaling-protocol";

const session = defineSession({
  authenticate: async (token) => verifyJwt(token),
  rateLimit: { chatPerSec: 5 },
  chatHistoryPerRoom: 50,
});

// 1. Tell the engine where to send outbound messages.
session.onSend((peerId, message) => {
  const socket = mySocketRegistry.byPeerId(peerId);
  socket?.send(JSON.stringify(message));
});

// 2. For each new connection, register it.
yourTransport.on("connection", async (socket) => {
  const socketId = randomUUID();
  await session.handleConnection(socketId, { token: extractToken(socket) });

  socket.on("message", (raw) => {
    void session.handleMessage(socketId, raw.toString());
  });
  socket.on("close", () => {
    void session.handleDisconnect(socketId);
  });
});
```

The `Session` is pure logic — no I/O of its own. You wire it to whatever socket abstraction you have. The `signaling-adapter-*` packages are reference implementations of this exact pattern.

### Browser side: implement `SignalingTransport`

```ts
import {
  definePublisher,
  type SignalingTransport,
  type SignalingMessageType,
  type TransportState,
} from "@forinda/video-sdk-core";

class MyTransport implements SignalingTransport {
  state: TransportState = "idle";
  // …
  async connect() {
    /* open your socket, set state */
  }
  async disconnect() {
    /* close your socket */
  }
  async send(msg: SignalingMessageType) {
    /* serialize + send */
  }
  on<E extends "message" | "state">(event: E, handler: (...args: unknown[]) => void): () => void {
    /* subscribe to inbound messages or state transitions */
  }
}

const publisher = definePublisher({
  signaling: new MyTransport(),
  room: "demo",
  stream,
});
await publisher.start();
```

The `SignalingTransport` interface is **the only contract** between core and the wire. As long as your transport delivers `SignalingMessageType` payloads in either direction, every `core` API works against it — `defineRoom`, `defineRoomChannel`, `useUploader`, all of them.

**Test fixture:** `defineEngineFixture` in `@forinda/test-helpers` is a useful pattern — it creates paired transports against a real `Session` for unit tests, no sockets involved.

---

## Choosing per-pattern config

| Knob                               | Webinar                       | Mesh meeting                 | Custom backend        |
| ---------------------------------- | ----------------------------- | ---------------------------- | --------------------- |
| Engine `chatHistoryPerRoom`        | ≥ 100 (late joiners catch up) | 0 (no replay needed)         | depends on UX         |
| Engine `enforceModerationCommands` | `true` (host-only mute/kick)  | `false` (peer-to-peer trust) | depends on auth model |
| Recorder `timesliceMs`             | 1000 (drain to uploader)      | unset (rare in mesh)         | n/a                   |
| Per-peer `rateLimit.chatPerSec`    | 2-5                           | 5-10                         | per your SLA          |
| `defineRoom` vs raw factories      | always Room                   | always Room                  | either works          |
