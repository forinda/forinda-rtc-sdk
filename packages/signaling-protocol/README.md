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

A zod discriminated union covering join/leave, peer notifications, SDP/ICE, presence, chat, and EPIC-12 moderation. Validate any inbound message with `SignalingMessage.parse(raw)`.

| `type`              | direction         | purpose                                                                        |
| ------------------- | ----------------- | ------------------------------------------------------------------------------ |
| `join`              | client → server   | enter a room as `publisher`, `viewer`, `presence`, or `director`               |
| `leave`             | client → server   | exit a room voluntarily                                                        |
| `peer-joined`       | server → client   | another peer arrived                                                           |
| `peer-left`         | server → client   | another peer departed                                                          |
| `sdp`               | peer → peer (s)   | offer / answer SDP exchange                                                    |
| `ice`               | peer → peer (s)   | ICE candidate (or `null` end-of-candidates)                                    |
| `presence-update`   | client → server   | set / replace / delete this peer's presence attributes (`null` = delete)       |
| `presence-state`    | server → client   | broadcast on any peer's presence change; empty `attributes` = cleared          |
| `presence-snapshot` | server → joiner   | one-shot full snapshot sent right after join                                   |
| `chat`              | client ↔ peer(s)  | broadcast text (no `to`) or DM (`to: peerId`)                                  |
| `chat-history`      | server → joiner   | one-shot replay (when joiner sets `replayHistory: true` and engine has buffer) |
| `mute`              | director → server | mute the target's audio or video (relayed + presence-state broadcast)          |
| `unmute`            | director → server | clear a previous `mute`                                                        |
| `kick`              | director → server | force-remove the target (engine-enforced when enforcement is on)               |
| `kicked`            | server → target   | one-shot notification right before the engine drops the binding                |
| `promote`           | director → server | add `target` to the room's director set                                        |
| `demote`            | director → server | remove `target` from the room's director set                                   |
| `set-bitrate`       | director → server | bandwidth ceiling hint relayed to the target                                   |

Presence attribute values are `JsonValue` (recursive JSON shape). Use `null` to delete a key.

The engine maintains a per-room presence map; joiners always receive a `presence-snapshot` (empty `peers: {}` when nobody has set anything yet) and any subsequent `presence-state` events as they arrive.

## Errors

All thrown errors extend `SignalingProtocolError` and carry a stable `code`:

| Class                            | `code`                 | When thrown                                                                         |
| -------------------------------- | ---------------------- | ----------------------------------------------------------------------------------- |
| `SignalingValidationError`       | `signaling_validation` | Invalid JSON or schema-failing message                                              |
| `SignalingAuthError`             | `signaling_auth`       | `authenticate` callback returned `false`                                            |
| `RoomFullError`                  | `room_full`            | Room already at `maxPeersPerRoom`                                                   |
| `PeerNotFoundError`              | `peer_not_found`       | SDP/ICE target peer is not registered                                               |
| `SignalingRateLimitError`        | `rate_limited`         | Per-peer chat / presence-update rate-limit bucket is exhausted                      |
| `SignalingDirectorConflictError` | `director_conflict`    | A second peer tried to join with `role: "director"` while a director already exists |
| `SignalingPermissionError`       | `not_authorized`       | A non-director sent a moderation command and `enforceModerationCommands` is on      |

### Per-peer rate limits

```ts
const engine = defineSignalingEngine({
  rateLimit: { chatPerSec: 5, presenceUpdatesPerSec: 10 },
});
```

Each option enables a per-peer token bucket of size = capacity = refill rate. Burst allowance equals the per-second cap. Over-budget messages reject with `SignalingRateLimitError(code: "rate_limited")`; the message is NOT relayed. Buckets are released when the peer disconnects.

`undefined` (or `0`) on either field disables that limiter independently — the chat budget can be capped without touching presence and vice versa.

### Chat-history replay

```ts
const engine = defineSignalingEngine({ chatHistoryPerRoom: 50 });
```

Each room keeps a ring buffer of its last N chats. Joiners that send `replayHistory: true` on their `join` receive a one-shot `chat-history` message right after `presence-snapshot` — empty `messages` array if no history has accumulated yet.

Old clients omit the flag; they never see the new message type and continue working unchanged.

### Director / moderation

```ts
const engine = defineSignalingEngine({ enforceModerationCommands: true });
```

The `Role` enum gains `"director"`. The first peer to join a room with `role: "director"` claims it; subsequent claims throw `SignalingDirectorConflictError`. Co-directors are added at runtime via the `promote` command.

Six director-only commands ride the wire: `mute`, `unmute`, `kick`, `promote`, `demote`, `set-bitrate`.

- **Honor mode (default)**: the engine relays each command to the target and (for `mute`/`unmute`) updates the target's presence attributes so every peer sees the state change. The target's client decides whether to obey. Non-director senders are accepted.
- **Enforced mode** (`enforceModerationCommands: true`): non-director senders are rejected with `SignalingPermissionError(code: "not_authorized")`. `kick` additionally removes the target from the room (forced disconnect on the host side).

`mute` / `unmute` encode state as presence attributes (`director-muted-audio: true`, `director-muted-video: true`) so late joiners see the current state via the existing `presence-snapshot`. No new state-snapshot wire type was added.

## License

MIT — © 2026 Felix Orinda.
