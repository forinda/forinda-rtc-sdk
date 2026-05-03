# SFU integration

When mesh hits its ceiling (~6-8 viewers per publisher on residential uplinks), an SFU offloads the fan-out to a dedicated media server. The Forinda SDK ships a side-by-side LiveKit adapter so you can swap one factory call instead of rewriting your app.

## When to use SFU

| Scale / shape                               | Use                                                                      |
| ------------------------------------------- | ------------------------------------------------------------------------ |
| 1-on-1 / small group (≤ 6 peers, full mesh) | `definePublisher` / `defineViewer` over our WebSocket signaling.         |
| 1-publisher webinar (1 → N viewers)         | SFU. Mesh would force the publisher to upload N copies.                  |
| Town-hall (2-3 publishers, many viewers)    | SFU. Same reason.                                                        |
| Recording at scale, server-side             | SFU + LiveKit's egress (out of scope here — use LiveKit's API directly). |

## Two-transport model

The SFU adapter only handles **media** (publish + subscribe). Chat, presence, raise-hand, recording metadata, moderation — all of those continue to ride **our own WebSocket signaling** via `defineRoomChannel`. So a typical SFU app has two transports:

```
   ┌──────────────────────────┐
   │ App                      │
   │                          │
   │  defineSfuPublisher  ───►│ ws://lk.example.com   ←── LiveKit Cloud / self-host
   │                          │
   │  defineRoomChannel   ───►│ wss://signal.app/ws   ←── Our signaling-server
   │  defineRecorder          │
   └──────────────────────────┘
```

## Setting up LiveKit

1. **LiveKit Cloud** (zero ops): sign up at livekit.io, grab the websocket URL + API key/secret from the project dashboard.
2. **Self-host**: `docker run --rm -p 7880:7880 livekit/livekit-server --dev` for local; production deploy guide is in LiveKit's docs.

## Minting a token (server-side)

LiveKit uses JWTs scoped to (room, identity, permissions). Mint server-side:

```ts
// Node, in your auth handler
import { AccessToken } from "livekit-server-sdk";

const token = new AccessToken(process.env.LK_API_KEY, process.env.LK_API_SECRET, {
  identity: userId,
  ttl: 60 * 60, // 1 hour
});
token.addGrant({ roomJoin: true, room: roomName, canPublish: true, canSubscribe: true });
return token.toJwt();
```

The browser passes this JWT to `defineSfuPublisher({ token })` — never store the API secret in browser code.

## Publisher

```ts
import { defineSfuPublisher } from "@forinda/video-sdk-sfu-livekit";

const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
const publisher = defineSfuPublisher({
  url: "wss://my-project.livekit.cloud",
  token, // server-minted
  room: "webinar-2026",
  peerId: "host-alice",
  stream,
});
publisher.on("viewer-joined", ({ peerId }) => console.log("viewer:", peerId));
await publisher.start();
```

## Viewer

```ts
import { defineSfuViewer } from "@forinda/video-sdk-sfu-livekit";

const viewer = defineSfuViewer({
  url: "wss://my-project.livekit.cloud",
  token, // separate token, scoped to canSubscribe
  room: "webinar-2026",
  peerId: "viewer-bob",
  publisherId: "host-alice",
});
viewer.on("track", ({ stream }) => {
  document.querySelector("video").srcObject = stream;
});
await viewer.start();
```

## Adapter hooks

Same shapes as the mesh hooks, with `Sfu` in the name and the LiveKit-specific options (`url`, `token`):

```tsx
// React
import { useSfuPublisher, useSfuViewer } from "@forinda/video-sdk-react";

const { state, viewers } = useSfuPublisher({ url, token, room, peerId, stream });
const { stream } = useSfuViewer({ url, token, room, peerId, publisherId });
```

```ts
// Vue
import { useSfuPublisher, useSfuViewer } from "@forinda/video-sdk-vue";
```

## Wiring chat alongside SFU

The chat layer rides our own signaling — completely independent of LiveKit:

```ts
import { defineWebSocketSignaling, defineRoomChannel } from "@forinda/video-sdk-core";

const chatTransport = defineWebSocketSignaling({ url: "wss://signal.app/ws" });
const channel = defineRoomChannel({
  signaling: chatTransport,
  room: "webinar-2026", // same room id; different transport
  peerId: "host-alice",
});
await channel.start();
await channel.sendChat("hello room");
```

`peerId` and `room` should match between SFU and chat so your UI can map presence ↔ tracks consistently. The two services don't talk to each other; the app code is the bridge.

## Recording with SFU

`defineRecorder` is media-transport-agnostic — it records a `MediaStream`. With SFU, the publisher's `stream` is still the local one passed at construction:

```ts
const recorder = defineRecorder(stream, { timesliceMs: 1000 });
recorder.pipeTo(uploader);
recorder.start();
```

For server-side recording (composited output of all participants), use LiveKit's egress API directly — that's outside the SDK's scope.

## Mesh → SFU migration

A typical migration is one-line per call site:

```diff
-const publisher = definePublisher({ signaling, room, peerId, stream });
+const publisher = defineSfuPublisher({ url: LK_URL, token, room, peerId, stream });
```

The event surface (`state`, `viewer-joined`, `error`) is identical — your UI usually doesn't change. The biggest difference is that you now need a token-minting endpoint on your server.

## Bundle impact

`livekit-client` is ~150 KB minified. To keep it out of mesh-only consumers' bundles, it's a **peer dependency** — you opt in by installing it alongside `@forinda/video-sdk-sfu-livekit`:

```bash
pnpm add @forinda/video-sdk-sfu-livekit livekit-client
```

If you only use mesh, never install either and your bundle stays slim.

## Troubleshooting

| Code                 | Meaning                                                                                              |
| -------------------- | ---------------------------------------------------------------------------------------------------- |
| `sfu_token_invalid`  | Token expired, malformed, or doesn't grant the requested room. Check the `AccessToken` minting code. |
| `sfu_connect_failed` | Couldn't reach the LiveKit websocket. Network / firewall / wrong URL.                                |
| `sfu_publish_failed` | `LocalParticipant.publishTrack` rejected. Usually codec or device permissions.                       |
| `sfu_disconnected`   | Room dropped mid-session. LiveKit handles its own reconnect; surface the error to the user.          |
