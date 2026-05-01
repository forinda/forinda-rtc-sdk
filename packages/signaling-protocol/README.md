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

Six message types as a zod discriminated union: `join`, `leave`, `peer-joined`, `peer-left`, `sdp`, `ice`. Validate any inbound message with `SignalingMessage.parse(raw)`.

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
