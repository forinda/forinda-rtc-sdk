# @forinda/video-sdk-react

## 0.1.1

### Patch Changes

- [`0c25d10`](https://github.com/forinda/forinda-rtc-sdk/commit/0c25d108fecb8266696c633904cb4b303a9a4179) Thanks [@forinda](https://github.com/forinda)! - Documentation pass — no code changes.

  - Replaced placeholder READMEs on the four signaling-adapter packages with full surface docs (options table, handle shape, auth example, what-it-doesn't-do). `signaling-adapter-hono` and `signaling-adapter-bun` are explicitly flagged as stub packages with workarounds documented.
  - `core`: install snippet now lists `@forinda/video-sdk-signaling-ws` (the example uses it). Recording options table now documents `maxBufferedBytes`. Added a `definePresenceDiff` example next to the Room channel section.
  - `react`: install snippet fix to match `core`. `useRoomChannel` result now shows the `state` field. `useRecorder` example shows `downloadUrl` and `maxBufferedBytes`.
  - All cross-package links in published READMEs are now absolute npm URLs so they resolve when rendered on npmjs.com.
  - Stripped every `EPIC-N` and `docs/superpowers/` reference from adopter-facing READMEs.

- Updated dependencies [[`0c25d10`](https://github.com/forinda/forinda-rtc-sdk/commit/0c25d108fecb8266696c633904cb4b303a9a4179)]:
  - @forinda/video-sdk-core@0.1.1

## 0.1.0

### Minor Changes

Initial public release.

- `<VideoSdkProvider signaling iceServers retry>` — supplies default config to all hooks. `signaling` is a factory.
- `<VideoView stream={...} />` — `<video>` wrapper that handles `srcObject` and forwards refs. Optional `mirror` prop.
- 11 hooks:
  - `useUserMedia({ audio, video })` — request a `MediaStream`, manage tracks, expose state. SSR + StrictMode safe.
  - `useDisplayMedia({ autoStart? })` — screen-share `getDisplayMedia` wrapper with `"ended"` state for the browser's "Stop sharing" pill.
  - `useDevices()` — camera/mic/speaker enumeration with hotplug auto-refresh.
  - `usePublisher({ room, stream })` — construct + manage a `Publisher`; snapshot of `state`, `viewers`, `stats`, `error`.
  - `useViewer({ room, publisherId })` — symmetric viewer hook.
  - `useConnectionStats(publisherOrViewer, { interval? })` — standalone stats subscription.
  - `useRoomChannel({ room, peerId? })` — presence + chat channel with transport `state` passthrough.
  - `usePresence(channel)` — live `peers` map + `setAttribute` / `removeAttribute` / `clearAttributes`.
  - `useChat(channel)` — `messages` + `send(body, { to? })`.
  - `useRaiseHand(channel)` — sugar `{ raised, raise, lower, toggle }`.
  - `useRecorder(stream, opts?)` — record any `MediaStream` to a `Blob`; lazy `downloadUrl` revoked on unmount.

Requires React 18+ (uses `useSyncExternalStore`). Peer dep: `@forinda/video-sdk-core`.
