# @forinda/video-sdk-core

## 0.2.0

### Minor Changes

- [`314182f`](https://github.com/forinda/forinda-rtc-sdk/commit/314182f615a69e6e1dd345308206d35ecbedb1bb) Thanks [@forinda](https://github.com/forinda)! - Director role + moderation commands (EPIC-12).

  ### Added

  - **`Role: "director"`** — fourth role in the schema. The engine enforces first-claim wins per room: a second peer attempting to join with `role: "director"` rejects with the new `SignalingDirectorConflictError(code: "director_conflict")`.
  - **Six director-only commands** as flat top-level wire-format messages: `mute`, `unmute`, `kick`, `promote`, `demote`, `set-bitrate`. Plus a server → target `kicked` notification.
  - **Honor-based by default** — the engine relays each command to the target. With `defineSignalingEngine({ enforceModerationCommands: true })` the engine rejects non-director senders with the new `SignalingPermissionError(code: "not_authorized")`. Enforced `kick` additionally drops the target's room binding.
  - **State piggybacks on presence** — `mute` / `unmute` encode their effect as `director-muted-audio` / `director-muted-video` attributes on the target's presence entry, so late joiners see current mute state via the existing `presence-snapshot` mechanism. No new state-snapshot wire type added.
  - **`Room.directors`** (core) — live `readonly string[]` of director peer ids, kept in sync with `peer-joined` / `peer-left` / `promote` / `demote` events. New `joined` event fires once `ensureJoined` succeeds.
  - **`useRoom().role` / `directors` / `sendCommand(cmd)`** (react) — adapter surface for moderation UIs.

  ### Deferred to follow-up (EPIC-12b)

  - Vue adapter parity for `sendCommand`.
  - `<forinda-room-controls>` Web Component.
  - Server-enforced `set-bitrate` (requires SFU integration — EPIC-14).

- [`d311a25`](https://github.com/forinda/forinda-rtc-sdk/commit/d311a25af404cc78a2af5505a6f5351eb2fe4d86) Thanks [@forinda](https://github.com/forinda)! - Engine hardening: per-peer rate limits + opt-in chat-history replay.

  ### Added

  - **Per-peer rate limits** on `chat` and `presence-update`. New `defineSignalingEngine({ rateLimit: { chatPerSec, presenceUpdatesPerSec } })` option installs token buckets per peer per message type. Over-budget messages reject with the new `SignalingRateLimitError(code: "rate_limited")` — they are NOT relayed. Disabled by default; each cap is independent.
  - **Per-room chat history** on the engine. New `defineSignalingEngine({ chatHistoryPerRoom })` option keeps a ring buffer of the last N chats per room. Joiners opt into the replay by setting `replayHistory: true` on their `join` — the engine then sends a single `chat-history` wire message right after `presence-snapshot`. Old clients omit the flag and continue to work unchanged (no breaking wire-format change for non-opting consumers).
  - **`RoomChannel` adapter**: new `replayHistory?: boolean` option mirrors the wire flag. When set, the channel seeds `chatHistory` from the replay and emits a `chat-history` event once.

  ### Rationale

  `presence-update` and `chat` are the cheapest messages to spam — without limits one rogue peer can flood the relay path. The per-peer token bucket caps each independently, fails closed at the engine boundary (no half-relayed messages), and burns peer-local state that's reclaimed on disconnect.

  Chat-history replay closes the obvious gap for late joiners — moderation chat, support tickets, and recorded sessions all need newcomers to see the room as it stands. The opt-in flag keeps it a zero-cost upgrade for consumers that don't need it.

- [`e67a6f5`](https://github.com/forinda/forinda-rtc-sdk/commit/e67a6f509366e992d77a05c784933f10e29ee9bf) Thanks [@forinda](https://github.com/forinda)! - Streaming-upload sink for `Recorder` + declarative element wiring.

  ### Added

  - **`defineUploader({ url, headers?, maxQueuedBytes?, keepaliveThresholdBytes? })`** — HTTP-POST-per-chunk sink for streaming recordings off the device. Uses `fetch` with `keepalive: true` for chunks at or below the threshold (default 60 KB) so chunks survive a page unload, regular `fetch` above. Internal FIFO queue capped at 100 MiB by default.
  - **`recorder.pipeTo(uploader)` / `pipeRecorderTo(recorder, uploader)`** — wires `dataavailable` → `uploader.send`. On `failed` → `recorder.pause()`; on recovery via `uploader.retry()` → `recorder.resume()`. Returns a disposer.
  - **`<forinda-recorder for="…">`** — looks up `document.getElementById(for).mediaStream` at `start()` time. Lets you wire publisher → recorder declaratively without JS.
  - **`<forinda-uploader url="…" headers="…">`** — slottable inside `<forinda-recorder>`. The recorder discovers slotted uploaders at start and pipes each chunk to them. Multiple uploaders allowed.
  - **React: `useUploader(recorder, uploader)`** and **Vue: `useUploader(recorder, uploader)`** — adapter helpers exposing `{ state, pendingBytes, error, retry }`.

  ### Rationale

  `defineRecorder` previously buffered every chunk in memory until `stop()`, putting a hard ceiling on recording length. `pipeTo(uploader)` drains chunks as they arrive, with explicit backpressure (`failed` → pause, consumer-driven `retry()` → resume) so a flaky upload server can't silently lose data.

- [`ce3a414`](https://github.com/forinda/forinda-rtc-sdk/commit/ce3a414c781c90e648992c6be7af09ccf1afc2cc) Thanks [@forinda](https://github.com/forinda)! - `RoomChannel` resilience: optimistic chat + reconnect with presence resync.

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

### Patch Changes

- [`e26b57d`](https://github.com/forinda/forinda-rtc-sdk/commit/e26b57d51437969aee97720d63f787adbf1d76da) Thanks [@forinda](https://github.com/forinda)! - `defineRoom` higher-level coordinator + minified browser bundles.

  ### Added — `defineRoom`

  `@forinda/video-sdk-core` ships `defineRoom({ signaling, room, peerId? })`, a coordinator that owns one transport's lifecycle and the **single** `join` for a room. Eliminates the silent-overwrite footgun where a `Publisher` and a `RoomChannel` sharing one transport both issue `join` and the engine quietly drops the first peer binding.

  Compose via the Room's sugar methods:

  ```ts
  const room = defineRoom({ signaling, room: "demo", peerId: "alice" });
  const publisher = room.publisher({ stream });
  const channel = room.channel(); // presence + chat over the same socket
  const recorder = room.recorder(stream);
  await publisher.start();
  await channel.start(); // shares the join — no second peer binding
  ```

  Or use the proxy factories directly: `defineAttachedPublisher(room, opts)`, `defineAttachedViewer(room, opts)`, `defineAttachedRoomChannel(room, opts)`. Standalone `definePublisher` / `defineViewer` / `defineRoomChannel` are unchanged — the new APIs are purely additive.

  `@forinda/video-sdk-react` adds `useRoom({ room, peerId? })` and extends `usePublisher` / `useViewer` / `useRoomChannel` with an `attach?: Room` option. When attached, the hook ignores its own `room`/`peerId`/`signaling` (taken from the Room).

  ### Changed — minified browser bundles

  `@forinda/video-sdk-core`, `@forinda/video-sdk-react`, `@forinda/video-sdk-elements`, `@forinda/video-sdk-signaling-ws`, `@forinda/video-sdk-signaling-broadcast`, and `@forinda/video-sdk-signaling-protocol` now ship minified ESM (and IIFE for `elements`). Sourcemaps are still emitted, so DevTools stack traces stay readable.

  Server packages (`signaling-server`, `signaling-adapter-*`) intentionally ship unminified — Node-side, no bandwidth concern, cleaner native stack traces.

  Approximate gzipped reductions:

  - `core`: 12.08 KB → 8.40 KB (-30%)
  - `signaling-protocol`: 5.13 KB → 2.50 KB (-51%)
  - `signaling-ws`: 1.85 KB → 1.47 KB (-21%)
  - `react`: 3.41 KB → 3.20 KB (-6%)
  - `signaling-broadcast`: 814 B → 706 B (-13%)
  - `elements`: unchanged tiny — most code is in `core` (external)

- [`195f0e3`](https://github.com/forinda/forinda-rtc-sdk/commit/195f0e3c8afdfc3192db0de71684be545512897d) Thanks [@forinda](https://github.com/forinda)! - Test infrastructure (EPIC-8 finish): integration suite, load harness, vitest-browser projects, Playwright e2e.

  ### Added (test infra — no public surface change for adopters)

  - **`packages/integration-tests/`** (private) — cross-package suite running against a real `defineDevServer`. Three flows: Room end-to-end (publisher + channel + recorder share one transport / one join), RoomChannel reconnect across server bounce, chat-history replay end-to-end.
  - **`tools/load-signaling.mjs`** — `pnpm load:signaling --rooms N --peers M --chatPerSec X --duration S` synthetic chat generator with throughput + p50/p95/p99 latency reporting.
  - **Vitest browser projects** in core, react, web-components — `pnpm test:browser` runs media-touching tests under headless Chromium with synthetic getUserMedia.
  - **`e2e/` Playwright project** — boots dev-signaling-server + the React example via `webServer`, runs a two-tab Publisher↔Viewer spec.
  - **CI**: four new jobs (`integration`, `load`, `browser`, `e2e`) running in parallel on every PR.

  ### Public surface change (incidental)

  Engine options (`rateLimit`, `chatHistoryPerRoom`, `enforceModerationCommands`) now flow from `defineSignalingServer` and `defineWebSocketSignalingServer` into a default-constructed `SignalingEngine`. Previously these options were only reachable by passing a manually-built engine. Existing callers that pass `engine: defineSignalingEngine({...})` are unaffected; new callers can now configure the engine directly via the server factories.

  ### Deferred

  - Chat round-trip e2e — placeholder `test.skip` (requires the React example to expose a chat input).
  - Full WebRTC media transit assertion in headless Chromium — needs explicit ICE config (deferred to EPIC-14 SFU integration).

- Updated dependencies [[`e26b57d`](https://github.com/forinda/forinda-rtc-sdk/commit/e26b57d51437969aee97720d63f787adbf1d76da), [`314182f`](https://github.com/forinda/forinda-rtc-sdk/commit/314182f615a69e6e1dd345308206d35ecbedb1bb), [`d311a25`](https://github.com/forinda/forinda-rtc-sdk/commit/d311a25af404cc78a2af5505a6f5351eb2fe4d86), [`195f0e3`](https://github.com/forinda/forinda-rtc-sdk/commit/195f0e3c8afdfc3192db0de71684be545512897d), [`e67a6f5`](https://github.com/forinda/forinda-rtc-sdk/commit/e67a6f509366e992d77a05c784933f10e29ee9bf), [`ce3a414`](https://github.com/forinda/forinda-rtc-sdk/commit/ce3a414c781c90e648992c6be7af09ccf1afc2cc)]:
  - @forinda/video-sdk-signaling-protocol@0.2.0

## 0.1.1

### Patch Changes

- [`0c25d10`](https://github.com/forinda/forinda-rtc-sdk/commit/0c25d108fecb8266696c633904cb4b303a9a4179) Thanks [@forinda](https://github.com/forinda)! - Documentation pass — no code changes.

  - Replaced placeholder READMEs on the four signaling-adapter packages with full surface docs (options table, handle shape, auth example, what-it-doesn't-do). `signaling-adapter-hono` and `signaling-adapter-bun` are explicitly flagged as stub packages with workarounds documented.
  - `core`: install snippet now lists `@forinda/video-sdk-signaling-ws` (the example uses it). Recording options table now documents `maxBufferedBytes`. Added a `definePresenceDiff` example next to the Room channel section.
  - `react`: install snippet fix to match `core`. `useRoomChannel` result now shows the `state` field. `useRecorder` example shows `downloadUrl` and `maxBufferedBytes`.
  - All cross-package links in published READMEs are now absolute npm URLs so they resolve when rendered on npmjs.com.
  - Stripped every `EPIC-N` and `docs/superpowers/` reference from adopter-facing READMEs.

## 0.1.0

### Minor Changes

Initial public release.

- `definePublisher({ signaling, room, stream })` — one-publisher → many-viewers WebRTC orchestrator. Per-viewer `RTCPeerConnection` management, perfect-negotiation, SDP/ICE routing, stats aggregation, hot track-swap, auto-retry.
- `defineViewer({ signaling, room, publisherId })` — symmetric receiver.
- `defineRoomChannel({ signaling, room, peerId? })` — presence + chat layer with `setAttribute` / `removeAttribute` / `raiseHand` / `lowerHand` / `sendChat` and rolling chat history.
- `defineRecorder(stream, opts?)` — `MediaRecorder` wrapper with codec auto-pick, bitrate hints, chunked output via `timesliceMs`, `maxBufferedBytes` overflow guard, typed lifecycle state machine.
- `getUserMedia` / `getDisplayMedia` (screen share) / `enumerateDevices` / `watchDevices` / `replaceVideoTrack` / `replaceAudioTrack` / `buildConstraints`.
- `defineNegotiator` (perfect-negotiation), `definePeerConnection`, `normalizeIceServers`, SDP read helpers.
- `defineStatsCollector` polling wrapper + `normalizeStats` reducer + `ConnectionStats` flat shape.
- `defineStateMachine`, `defineRetryPolicy` (exponential backoff + jitter, bounded by `maxAttempts` / `maxDurationMs`).
- `defineEmitter`, `setLogger`, full `SdkError` hierarchy with stable `code` strings.
- `definePresenceDiff(prev, next)` for delta UIs.

Browser-only, ESM-only. Depends on `@forinda/video-sdk-signaling-protocol` (zod wire validation) and `zod`.
