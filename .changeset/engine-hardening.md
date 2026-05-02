---
"@forinda/video-sdk-signaling-protocol": minor
"@forinda/video-sdk-core": minor
"@forinda/video-sdk-react": patch
"@forinda/video-sdk-vue": patch
"@forinda/video-sdk-signaling-ws": patch
"@forinda/video-sdk-signaling-broadcast": patch
"@forinda/video-sdk-elements": patch
---

Engine hardening: per-peer rate limits + opt-in chat-history replay.

### Added

- **Per-peer rate limits** on `chat` and `presence-update`. New `defineSignalingEngine({ rateLimit: { chatPerSec, presenceUpdatesPerSec } })` option installs token buckets per peer per message type. Over-budget messages reject with the new `SignalingRateLimitError(code: "rate_limited")` — they are NOT relayed. Disabled by default; each cap is independent.
- **Per-room chat history** on the engine. New `defineSignalingEngine({ chatHistoryPerRoom })` option keeps a ring buffer of the last N chats per room. Joiners opt into the replay by setting `replayHistory: true` on their `join` — the engine then sends a single `chat-history` wire message right after `presence-snapshot`. Old clients omit the flag and continue to work unchanged (no breaking wire-format change for non-opting consumers).
- **`RoomChannel` adapter**: new `replayHistory?: boolean` option mirrors the wire flag. When set, the channel seeds `chatHistory` from the replay and emits a `chat-history` event once.

### Rationale

`presence-update` and `chat` are the cheapest messages to spam — without limits one rogue peer can flood the relay path. The per-peer token bucket caps each independently, fails closed at the engine boundary (no half-relayed messages), and burns peer-local state that's reclaimed on disconnect.

Chat-history replay closes the obvious gap for late joiners — moderation chat, support tickets, and recorded sessions all need newcomers to see the room as it stands. The opt-in flag keeps it a zero-cost upgrade for consumers that don't need it.
