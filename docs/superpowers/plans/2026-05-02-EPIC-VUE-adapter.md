# EPIC-VUE Vue 3 Adapter Implementation Plan

> Mirror the entire React surface (post-EPIC-19) as Vue 3 composables + a `<VideoView>` SFC. Same API names, idiomatic Vue ergonomics.

**Goal:** Adopters using Vue or Nuxt can `pnpm add @forinda/video-sdk-vue` and get the same publish/view/chat/record/raise-hand/screen-share surface they'd get from `@forinda/video-sdk-react`, with no need to drop into `core` directly.

**Architecture:**

- New package `@forinda/video-sdk-vue`. Vue 3.4+ peer dep, Composition API only (no Options API support — the reactive boundary doesn't fit).
- `VideoSdkPlugin` registers default config (signaling factory, ICE servers, retry policy) via Vue's `app.use`. Composables read it via `inject` with a typed `Symbol` key.
- 12 composables match the React hook names exactly: `useUserMedia`, `useDisplayMedia`, `useDevices`, `usePublisher`, `useViewer`, `useConnectionStats`, `useRoom`, `useRoomChannel`, `usePresence`, `useChat`, `useRaiseHand`, `useRecorder`.
- `<VideoView>` SFC handles `srcObject` (which can't go on `<video :src>`) and optional `mirror` styling. Forwards every other `<video>` attr.
- Reactive state via `ref` / `computed`. Unsub via `onScopeDispose` (Vue's analogue of React's effect cleanup).
- SSR-safe (Nuxt-friendly): early-return inert refs on the server.

**Out of scope:**

- Options API support — Composition API only.
- Pinia / Vuex integrations — left to consumers.
- Vue 2 — no.

---

## File structure

- `packages/vue/package.json` — peer deps: `vue@^3.4`, `@forinda/video-sdk-core`. devDeps: `@vue/test-utils`, `@vitejs/plugin-vue`, vitest, jsdom, etc.
- `packages/vue/tsconfig.json` + `tsconfig.build.json`
- `packages/vue/tsup.config.ts` — ESM, minified, `@forinda/video-sdk-core` external, vue external
- `packages/vue/vitest.config.ts` — jsdom, `@vitejs/plugin-vue`
- `packages/vue/src/internal/ssr.ts` — `isServer` constant
- `packages/vue/src/plugin.ts` — `VideoSdkPlugin` + injection key + `useVideoSdkConfig` composable
- `packages/vue/src/use-user-media.ts`
- `packages/vue/src/use-display-media.ts`
- `packages/vue/src/use-devices.ts`
- `packages/vue/src/use-publisher.ts`
- `packages/vue/src/use-viewer.ts`
- `packages/vue/src/use-connection-stats.ts`
- `packages/vue/src/use-room.ts`
- `packages/vue/src/use-room-channel.ts`
- `packages/vue/src/use-presence.ts`
- `packages/vue/src/use-chat.ts`
- `packages/vue/src/use-raise-hand.ts`
- `packages/vue/src/use-recorder.ts`
- `packages/vue/src/video-view.vue`
- `packages/vue/src/index.ts` — re-exports
- `packages/vue/test/unit/*.test.ts` — composable + SFC tests
- `packages/vue/README.md`
- `examples/vue-publisher-viewer/` — Vite + Vue 3 example app
- Root `package.json` — add `dev:vue` script

---

## Task 1: Scaffold the package

- [ ] **Step 1:** Create dirs + `package.json` with peer deps + scripts (build, typecheck, lint, test) following the existing per-package wireit pattern.
- [ ] **Step 2:** `tsconfig.json` with `@/*` path alias, `tsconfig.build.json` for tsup.
- [ ] **Step 3:** `tsup.config.ts` with `minify: true`, externals for `vue` + `@forinda/video-sdk-core`.
- [ ] **Step 4:** `vitest.config.ts` with jsdom + `@vitejs/plugin-vue`.
- [ ] **Step 5:** `pnpm install` from root, verify `pnpm --filter @forinda/video-sdk-vue typecheck` is green on an empty `src/index.ts`.

## Task 2: Plugin + injection key

- [ ] `src/plugin.ts` exports a `Symbol`-typed injection key, a `VideoSdkPlugin` (Vue plugin object with `install(app, options)`), and a `useVideoSdkConfig()` composable that calls `inject` with a default empty config.
- [ ] Test: install plugin in a test app, assert `useVideoSdkConfig` returns the config.

## Task 3: Media composables (no signaling)

`useUserMedia`, `useDisplayMedia`, `useDevices` — return reactive refs, manage track teardown on unmount via `onScopeDispose`. Same SSR early-return pattern as React.

- [ ] One file per composable, mirroring React shapes.
- [ ] Tests: jsdom-mocked `navigator.mediaDevices`.

## Task 4: Publisher + Viewer + ConnectionStats composables

`usePublisher({ room, stream, attach? })`, `useViewer({ room, publisherId, attach? })`, `useConnectionStats(target, { interval? })`.

- [ ] Reactive refs for state, viewers (publisher), stream (viewer), stats, error.
- [ ] Stable methods (`start`, `stop`, `replaceVideoTrack`, `replaceAudioTrack` for publisher).
- [ ] Subscribe to events via `.on()`, unsubscribe on `onScopeDispose`.
- [ ] Tests with `defineEngineFixture` from test-helpers.

## Task 5: Room + RoomChannel + Presence + Chat + RaiseHand composables

`useRoom`, `useRoomChannel`, `usePresence`, `useChat`, `useRaiseHand` — same shapes as React.

- [ ] Composables.
- [ ] Tests.

## Task 6: Recorder composable

`useRecorder(stream, opts?)` — reactive `state`, `blob`, `downloadUrl` (lazy `URL.createObjectURL`, revoked on next blob / unmount).

- [ ] Composable.
- [ ] Tests using `installFakeMediaRecorder` from test-helpers.

## Task 7: `<VideoView>` SFC

Vue SFC equivalent of React's `<VideoView>`. `<script setup>` syntax. Props: `stream`, `mirror`. Exposes the `<video>` element via `defineExpose({ video })` so consumers can ref-forward.

- [ ] SFC.
- [ ] Test with `@vue/test-utils`.

## Task 8: Public surface + README

- [ ] `src/index.ts` re-exports every composable + plugin + VideoView.
- [ ] README mirrors the React README structure: install, quick start (composable + plugin install), per-composable reference, components section, provider section, behavior section, pitfalls.

## Task 9: Vue example app

- [ ] `examples/vue-publisher-viewer/` — Vite + Vue 3 + `<script setup>` SFC. Two-role flow (publish / view), mirroring the React example.
- [ ] Root `dev:vue` script.

## Task 10: Final pass + changeset + tag

- [ ] Format + lint + typecheck + test (full workspace).
- [ ] New changeset for `@forinda/video-sdk-vue` + `patch` for any other affected packages.
- [ ] Update root README to mention Vue alongside React + Web Components.
- [ ] `git tag -a v0.0.0-epic-vue -m "EPIC-VUE: Vue 3 adapter"`
