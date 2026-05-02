# EPIC-10 Screen Share Implementation Plan

> **For agentic workers:** Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `getDisplayMedia` to core, a `useDisplayMedia` hook to react, and `source="screen"` to `<forinda-video-publisher>`. Wire screen-share toggle into the React + web-components examples.

**Architecture:** No protocol changes. `Publisher.replaceVideoTrack` already exists, so screen share is just media acquisition + track swap. The same publisher entity stays connected; we change what's flowing through its outbound video sender.

**Out of scope:** simultaneous camera + screen (would need a second publisher; reachable today by instantiating two `definePublisher` calls — no SDK change required).

---

## File Structure

- `packages/core/src/media/display-media.ts` — `getDisplayMedia({ audio?, video? })` mirror of `getUserMedia` with the same error mapping.
- `packages/core/src/index.ts` — re-export.
- `packages/core/test/unit/media/display-media.test.ts` — error-mapping + happy-path tests.
- `packages/react/src/use-display-media.ts` — hook mirroring `useUserMedia` plus an `"ended"` state for browser-side stop.
- `packages/react/src/index.ts` — re-export.
- `packages/react/test/unit/use-display-media.test.tsx` — hook tests.
- `packages/web-components/src/elements/video-publisher.ts` — read `source` attribute (`"camera" | "screen"`, default `"camera"`); branch the media call.
- `packages/web-components/test/unit/video-publisher.test.ts` — extend for `source="screen"`.
- `examples/react-publisher-viewer/src/App.tsx` — add a "Share screen" button.
- `examples/web-components-publisher-viewer/index.html` + `src/main.ts` — same.
- READMEs for `core`, `react`, `elements` — document the new entry points.

---

## Task 1: `getDisplayMedia` in core

**Files:**

- Create: `packages/core/src/media/display-media.ts`
- Modify: `packages/core/src/index.ts`
- Create: `packages/core/test/unit/media/display-media.test.ts`

- [ ] **Step 1: Implement helper**

Mirror `getUserMedia.ts` line-for-line, but call `navigator.mediaDevices.getDisplayMedia(constraints)`. Map the `AbortError` (user cancelled the picker) to `PermissionDeniedError`.

- [ ] **Step 2: Re-export from `core/src/index.ts`**

```ts
export { getDisplayMedia } from "./media/display-media.ts";
```

- [ ] **Step 3: Write tests** — stub `navigator.mediaDevices.getDisplayMedia` (jsdom doesn't ship it) and assert each error mapping branch + the happy path.

- [ ] **Step 4: Verify**

Run: `pnpm --filter @forinda/video-sdk-core test`
Expected: all 170+ tests pass; new tests included.

- [ ] **Step 5: Commit**

```bash
git add packages/core
git commit -m "feat(core): add getDisplayMedia helper for screen share"
```

---

## Task 2: `useDisplayMedia` hook in react

**Files:**

- Create: `packages/react/src/use-display-media.ts`
- Modify: `packages/react/src/index.ts`
- Create: `packages/react/test/unit/use-display-media.test.tsx`

- [ ] **Step 1: Implement hook**

Mirror `use-user-media.ts`. Two differences:

- Calls `getDisplayMedia` instead of `getUserMedia`.
- Adds `"ended"` to the state union and listens to `videoTrack.onended` so the hook reflects when the user clicks the browser's "Stop sharing" UI.

Result type: `{ stream, error, state: "idle" | "requesting" | "granted" | "denied" | "ended" | "error", refresh, stop }`.

- [ ] **Step 2: Re-export from `react/src/index.ts`**

```ts
export {
  useDisplayMedia,
  type UseDisplayMediaResult,
  type DisplayMediaState,
} from "./use-display-media.ts";
```

- [ ] **Step 3: Write hook tests** with `@testing-library/react` mirroring the `use-user-media` test shape.

- [ ] **Step 4: Verify**

Run: `pnpm --filter @forinda/video-sdk-react test`
Expected: all hook tests green.

- [ ] **Step 5: Commit**

```bash
git add packages/react
git commit -m "feat(react): useDisplayMedia hook for screen share"
```

---

## Task 3: `source="screen"` on `<forinda-video-publisher>`

**Files:**

- Modify: `packages/web-components/src/elements/video-publisher.ts`
- Modify: `packages/web-components/test/unit/video-publisher.test.ts`
- Modify: `packages/web-components/README.md`

- [ ] **Step 1: Add attribute branch**

Read `source` (default `"camera"`). When `"screen"`, call `getDisplayMedia` instead of `getUserMedia`. Default `audio` to false for screen share unless `share-audio` attribute is present (matches browser behavior — most consumers don't want system audio).

Extend the `PublisherElementOverrides` interface with `getDisplayMedia` so tests can inject a fake.

- [ ] **Step 2: Tests**

- New test: `source="screen"` triggers `getDisplayMedia`, not `getUserMedia`.
- New test: `source="screen" share-audio` requests `{ audio: true, video: true }`.
- Existing tests still pass.

- [ ] **Step 3: README update**

Add `source` and `share-audio` rows to the publisher attributes table.

- [ ] **Step 4: Verify**

Run: `pnpm --filter @forinda/video-sdk-elements test`
Expected: all tests green; coverage threshold met.

- [ ] **Step 5: Commit**

```bash
git add packages/web-components
git commit -m "feat(elements): source='screen' attribute on video-publisher"
```

---

## Task 4: Wire screen-share into examples

**Files:**

- Modify: `examples/react-publisher-viewer/src/App.tsx`
- Modify: `examples/web-components-publisher-viewer/index.html`
- Modify: `examples/web-components-publisher-viewer/src/main.ts`

- [ ] **Step 1: React example**

In the `Publisher` component, add a "Share screen" button. On click, swap to a `useDisplayMedia` stream and call the publisher's `replaceVideoTrack(displayTrack)`. On stop, swap back.

- [ ] **Step 2: Web components example**

Add a "Share screen" button next to "Publish". Clicking it appends a _second_ `<forinda-video-publisher source="screen" room="…" signaling-url="…">` next to the existing one — demonstrates side-by-side screen + camera.

- [ ] **Step 3: Verify both build**

```bash
pnpm --filter example-react-publisher-viewer build
pnpm --filter example-web-components-publisher-viewer build
```

- [ ] **Step 4: Commit + tag**

```bash
git add examples
git commit -m "feat(examples): screen-share toggle in React + web-components apps"
git tag -a v0.0.0-epic-10 -m "EPIC-10: screen share"
```
