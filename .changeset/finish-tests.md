---
"@forinda/video-sdk-core": patch
"@forinda/video-sdk-signaling-protocol": patch
"@forinda/video-sdk-signaling-ws": patch
"@forinda/video-sdk-signaling-broadcast": patch
"@forinda/video-sdk-react": patch
"@forinda/video-sdk-vue": patch
"@forinda/video-sdk-elements": patch
---

Test infrastructure (EPIC-8 finish): integration suite, load harness, vitest-browser projects, Playwright e2e.

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
