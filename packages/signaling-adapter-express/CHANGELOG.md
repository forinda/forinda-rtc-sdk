# @forinda/video-sdk-signaling-adapter-express

## 0.1.2

### Patch Changes

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

- `defineExpressSignalingMiddleware({ path, ...wsOptions })` — mounts a WebSocket signaling endpoint inside an existing Express HTTP server via the `upgrade` event. Reuses your existing auth middleware via the request object passed through.
- Ships **dual ESM + CJS** to support CJS-first Express consumers.
