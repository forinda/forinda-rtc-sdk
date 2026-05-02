# @forinda/video-sdk-signaling-protocol

## 0.1.0

### Minor Changes

Initial public release.

- Pure `defineSignalingEngine({ maxPeersPerRoom?, authenticate? })` + `defineSession` — pluggable into any host (Node `ws`, Express, Hono, Bun, Cloudflare Workers, etc.). No I/O of its own.
- Wire-format zod discriminated union with 10 message types: `join`, `leave`, `peer-joined`, `peer-left`, `sdp`, `ice`, `presence-update`, `presence-state`, `presence-snapshot`, `chat`.
- `JsonValue` recursive type for free-form presence attributes; `null` is the delete sentinel.
- `Role` enum: `"publisher" | "viewer" | "presence"` (chat-only role).
- Per-room presence map; joiners always receive a `presence-snapshot` after `peer-joined` fanout.
- Chat routing: broadcast (no `to`) or DM (`to: peerId`); engine validates `from` matches the socket's bound peerId.
- Capacity enforcement (`RoomFullError`), auth callback, typed error hierarchy (`SignalingValidationError`, `SignalingAuthError`, `PeerNotFoundError`, `RoomFullError`).

Single source of truth for the wire format — every other package in this SDK imports from here.
