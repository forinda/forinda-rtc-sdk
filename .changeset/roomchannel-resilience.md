---
"@forinda/video-sdk-core": minor
"@forinda/video-sdk-signaling-protocol": minor
"@forinda/video-sdk-react": patch
"@forinda/video-sdk-vue": patch
"@forinda/video-sdk-signaling-ws": patch
"@forinda/video-sdk-signaling-broadcast": patch
"@forinda/video-sdk-elements": patch
---

`RoomChannel` resilience: optimistic chat + reconnect with presence resync.

### Added

- **Optimistic chat.** `sendChat()` synchronously appends a `pending` entry to `chatHistory` and emits `chat` so your UI can render the message before the round-trip. The server echoes the message back (matched by a new optional `clientId` on the wire) and the entry flips to `confirmed`. A new `chat-status` event surfaces the transitions; `sendChat()` now returns the entry's `id`.
- **Chat ack timeout.** New `chatAckTimeoutMs` option (default `10_000`). Un-acknowledged chats flip to `"failed"` after the timeout fires.
- **RoomChannel retry + presence resync.** New `retry?: RetryConfig` option (default enabled, same shape as Publisher/Viewer). On transport drop the channel reconnects with exponential backoff, re-issues `join` (when `manageJoin`), re-broadcasts every own presence attribute, and flips in-flight pending chats to `failed`.
- **Channel state event.** New `state` event with values `"idle" | "connecting" | "connected" | "reconnecting" | "closed"`, exposed as `channel.state` for snapshots.
- **Wire format**: `Chat` schema gains an optional `clientId` (max 64 chars). The engine round-trips it untouched and only echoes the message back to the sender when present — legacy clients without `clientId` get the original "fan-out to others only" behavior, no duplicate echo, no breakage.

### Adapter changes

- `useChat().send` (React + Vue) now returns `Promise<string>` (the entry id). Existing call sites that ignore the return value still compile.
- `ChatHistoryEntry` gains required `id: string` and `status: "pending" | "confirmed" | "failed"` fields. Consumers that only read `body` / `from` / `ts` are unaffected.

### Rationale

Production chat needs a way to tell the user "we sent your message" vs. "we tried — the server never confirmed it." The previous `sendChat` resolved as soon as the message hit the OS socket buffer, which says nothing about whether the engine accepted it. Pairing optimistic UI with a server-echo ack gives both responsiveness and honesty.
