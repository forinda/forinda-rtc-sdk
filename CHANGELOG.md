# Changelog

All notable changes to this repository. Per-package changelogs land here once Changesets is wired in EPIC-9.

The repo uses milestone tags (`v0.0.0-epic-N`) until the first npm release.

## Unreleased — EPIC-18 polish

### Added

- `@forinda/test-helpers`: `installFakeMediaRecorder` and `defineEngineFixture` (consolidated from per-package shims).
- `@forinda/video-sdk-core`: `definePresenceDiff(prev, next)` for delta UIs.
- `@forinda/video-sdk-core`: `Recorder` accepts `maxBufferedBytes` and emits `buffer-overflow` before transitioning to `error` — prevents OOM on long recordings.
- `@forinda/video-sdk-core`: `Recorder.bufferedByteCount` getter.
- `@forinda/video-sdk-react`: `useRecorder` returns `downloadUrl` (lazy `URL.createObjectURL`, revoked on next blob / unmount).
- `@forinda/video-sdk-react`: `useRoomChannel` returns `state` (transport-state passthrough for "Connecting…" UI).
- Repo-root `SECURITY.md`.

### Fixed

- `RoomChannel.start()` no longer calls `signaling.connect()` when the transport is already `connected` or `connecting` — fixes wasted work when sharing a transport with a `Publisher` / `Viewer`.

### Changed

- Test files in core / react / web-components import their `MediaRecorder` shim from `@forinda/test-helpers` instead of duplicating it. Net ~120 LOC removed.

## v0.0.0-epic-13 — Recording

`defineRecorder(stream, opts?)` + `useRecorder(stream)` + `<forinda-recorder>` element. Codec auto-pick, bitrate hints, chunked output via `timesliceMs`, lifecycle state machine.

## v0.0.0-epic-11 — Presence + raise hand + chat

`defineRoomChannel({...})` + `useRoomChannel` / `usePresence` / `useChat` / `useRaiseHand`. New protocol wire types: `presence-update`, `presence-state`, `presence-snapshot`, `chat`. `null` = delete sentinel for presence attributes.

## v0.0.0-epic-10 — Screen share

`getDisplayMedia` in core + `useDisplayMedia` hook + `source="screen"` on `<forinda-video-publisher>`. Audio opt-in via `share-audio`.

## v0.0.0-epic-8-partial — Test helpers

`@forinda/test-helpers` (private): `defineFakePeerConnection`, `defineInMemoryTransportPair`, `expectStateSequence`, `defineDevServer`, `recordRtpFlow`. Wired as devDep in core; promoted from `core/test/_mocks/`.

## v0.0.0-epic-7 — Examples

`apps/dev-signaling-server` + 3 example apps (vanilla TS, React, web-components). Vite 8.

## v0.0.0-epic-6 — Web Components

`<forinda-video-publisher>`, `<forinda-video-viewer>`, `<forinda-video-device-picker>` with shadow-DOM rendering + `::part()` styling.

## v0.0.0-epic-5 — React adapter

`VideoSdkProvider` + 5 hooks + `<VideoView>`. SSR-safe, StrictMode-safe.

## v0.0.0-epic-4b-partial — Server adapters

`signaling-adapter-ws`, `signaling-adapter-express`, `signaling-server` CLI. Hono + Bun adapters deferred.

## v0.0.0-epic-4a — Client transports

`signaling-ws` (WebSocket transport with auto-reconnect) + `signaling-broadcast` (same-tab demo).

## v0.0.0-epic-3b — Publisher/Viewer

`definePublisher` (1-pub-N-view) + `defineViewer` with SDP/ICE routing, stats aggregation, retry policy integration.

## v0.0.0-epic-3a — Core primitives

Logger, emitter, error tree, media helpers, peer-connection wrapper with perfect-negotiation, stats collector + normalizer, state machine, retry policy.

## v0.0.0-epic-2 — Signaling protocol

Wire-format zod schemas (single source of truth), pure `SignalingEngine` class, room/peer state model.
