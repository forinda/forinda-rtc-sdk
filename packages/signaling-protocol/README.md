# @forinda/video-sdk-signaling-protocol

Pure, transport-agnostic WebRTC signaling protocol engine + canonical wire-format zod schemas. Used by `@forinda/video-sdk-core` (browser) and every `@forinda/video-sdk-signaling-adapter-*` (server) as the single source of truth for messages and routing.

## Install

```bash
pnpm add @forinda/video-sdk-signaling-protocol
```

## Usage

```ts
import { defineSignalingEngine } from "@forinda/video-sdk-signaling-protocol";

const engine = defineSignalingEngine({
  authenticate: async (token, room) => verifyJwt(token),
  maxPeersPerRoom: 50,
});

const session = engine.openSession();
session.onSend((peerId, message) => {
  // your transport (WebSocket, EventSource, etc.) delivers `message` to the socket bound to `peerId`
});

// when a socket connects:
await session.handleConnection(socketId, { token: extractedToken });

// when a raw message arrives:
await session.handleMessage(socketId, rawJsonString);

// when a socket closes:
await session.handleDisconnect(socketId);
```

## Wire format

Ten message types as a zod discriminated union. Validate any inbound message with `SignalingMessage.parse(raw)`.

| `type`              | direction        | purpose                                                                  |
| ------------------- | ---------------- | ------------------------------------------------------------------------ |
| `join`              | client → server  | enter a room as `publisher`, `viewer`, or `presence` (chat-only)         |
| `leave`             | client → server  | exit a room voluntarily                                                  |
| `peer-joined`       | server → client  | another peer arrived                                                     |
| `peer-left`         | server → client  | another peer departed                                                    |
| `sdp`               | peer → peer (s)  | offer / answer SDP exchange                                              |
| `ice`               | peer → peer (s)  | ICE candidate (or `null` end-of-candidates)                              |
| `presence-update`   | client → server  | set / replace / delete this peer's presence attributes (`null` = delete) |
| `presence-state`    | server → client  | broadcast on any peer's presence change; empty `attributes` = cleared    |
| `presence-snapshot` | server → joiner  | one-shot full snapshot sent right after join                             |
| `chat`              | client ↔ peer(s) | broadcast text (no `to`) or DM (`to: peerId`)                            |

Presence attribute values are `JsonValue` (recursive JSON shape). Use `null` to delete a key.

The engine maintains a per-room presence map; joiners always receive a `presence-snapshot` (empty `peers: {}` when nobody has set anything yet) and any subsequent `presence-state` events as they arrive.

## Errors

All thrown errors extend `SignalingProtocolError` and carry a stable `code`:

| Class                      | `code`                 | When thrown                              |
| -------------------------- | ---------------------- | ---------------------------------------- |
| `SignalingValidationError` | `signaling_validation` | Invalid JSON or schema-failing message   |
| `SignalingAuthError`       | `signaling_auth`       | `authenticate` callback returned `false` |
| `RoomFullError`            | `room_full`            | Room already at `maxPeersPerRoom`        |
| `PeerNotFoundError`        | `peer_not_found`       | SDP/ICE target peer is not registered    |

## License

MIT — © 2026 Felix Orinda.
