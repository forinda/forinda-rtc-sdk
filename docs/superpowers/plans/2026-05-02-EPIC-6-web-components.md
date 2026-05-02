# EPIC-6: `@forinda/video-sdk-elements` Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship three Web Components — `<video-publisher>`, `<video-viewer>`, `<video-device-picker>` — that wrap the EPIC-3 core orchestration with HTML attributes + custom events. Drop into any framework that consumes custom elements (Vue, Svelte, Angular, Solid, plain HTML). Vanilla `HTMLElement` (no Lit/Stencil), ESM + IIFE builds, auto-register on import.

**Architecture:** Each element extends `HTMLElement`, observes the relevant attributes (`signaling-url`, `room`, etc.), constructs a `Publisher` / `Viewer` from `@forinda/video-sdk-core` + a `defineWebSocketSignaling` from `@forinda/video-sdk-signaling-ws` on `connectedCallback`, and forwards SDK events as `CustomEvent`s. Two element entry points: `index.ts` (auto-registers `<video-publisher>` / `<video-viewer>` / `<video-device-picker>` on import) and `manual.ts` (`defineElements({ prefix? })` for explicit + prefix-override registration).

`<video-publisher>` and `<video-viewer>` use **shadow DOM** with a single `<video part="video">` so consumers can style via `::part(video)`. `<video-device-picker>` uses **light DOM** — it's a `<select>`, must be styleable normally.

**Tech Stack:** TypeScript 6, ESM + IIFE (already configured in EPIC-1), Vitest 2 + jsdom, EPIC-3 `@forinda/video-sdk-core`, EPIC-4a `@forinda/video-sdk-signaling-ws`. Already-scaffolded package at `packages/web-components/` (publishes as `@forinda/video-sdk-elements`).

**Spec reference:** `docs/superpowers/specs/2026-05-02-video-sdk-design.md` — Section 9 (Web Components adapter).

**Project conventions:** factory style (`defineElements({...})`), inline JSDoc on every src file, `@/*` path alias in tests, tsconfig split, TS 6 import extensions, **thorough package README**.

**Definition of done:**

- All 7 tasks completed with their tests passing.
- `pnpm --filter @forinda/video-sdk-elements build typecheck test lint` exits 0.
- Coverage on `src/` ≥ 85% lines (attribute-driven elements have less unit-testable surface than pure JS).
- ESM + IIFE bundles emitted, `dist/index.global.js` registers elements automatically.
- Public surface in `src/index.ts` auto-registers; `src/manual.ts` exposes `defineElements({prefix?})`.
- Repo tagged `v0.0.0-epic-6`.

**Out of scope (deferred):**

- Custom Elements Manifest (`cem analyze`) — nice-to-have for IDE autocomplete; defer if it complicates the build.
- Real WebRTC integration tests — EPIC-8.
- Vue / Angular / Svelte framework-specific README sections — covered by general "works in any framework" note.

---

## File structure

```
packages/web-components/
  tsconfig.json                     # IDE + tests + @/ alias + DOM lib
  tsconfig.build.json               # tsup, src only
  vitest.config.ts                  # jsdom env, @/ alias
  package.json                      # add deps + test script + wireit test
  tsup.config.ts                    # already EPIC-1: ESM + IIFE
  src/
    index.ts                        # auto-register on import
    manual.ts                       # defineElements({prefix}) for explicit registration
    internal/
      attrs.ts                      # parse / validate element attributes
      send-event.ts                 # dispatch typed CustomEvent helper
    elements/
      video-publisher.ts            # <video-publisher>
      video-viewer.ts               # <video-viewer>
      video-device-picker.ts        # <video-device-picker>
  test/
    unit/
      auto-register.test.ts         # importing index.ts registers all 3 tags
      manual-define.test.ts         # defineElements({prefix: "x-"}) → x-video-publisher etc.
      video-publisher.test.ts       # attribute observation + custom events
      video-viewer.test.ts          # same shape
      video-device-picker.test.ts   # change event + light DOM
  README.md
```

---

## Pre-flight

```bash
cd /home/forinda/dev/open-source/forinda-video-sdk
git status                          # clean
git log --oneline -1                # HEAD descends from v0.0.0-epic-5
pnpm install --frozen-lockfile
pnpm --filter @forinda/video-sdk-elements build typecheck lint
```

---

## Task list

Each task = TDD-driven implementation. Code blocks authored inline.

### Task 1 — Vitest + tsconfig split + path aliases

**Files:** `packages/web-components/{tsconfig.json, tsconfig.build.json, vitest.config.ts, package.json}`

Add `vitest`, `@vitest/coverage-v8`, `jsdom`, `@types/jsdom` as dev deps. Add `@forinda/video-sdk-core` + `@forinda/video-sdk-signaling-ws` as devDeps for tests (they're already runtime deps of the elements). Split tsconfig + `@/*` alias. Vitest jsdom env.

Note: existing tsup.config from EPIC-1 already emits both `index.js` (ESM) + `index.global.js` (IIFE) + `manual.js` — keep as-is.

### Task 2 — Internal helpers

**Files:** `src/internal/attrs.ts`, `src/internal/send-event.ts`

`attrs.ts` — small helpers for reading typed attributes:

```ts
parseBool(el, attr): boolean      // "true"/empty → true, "false"/missing → false
parseNumber(el, attr, default): number
parseStringRequired(el, attr): string  // throws if missing
parseStringOptional(el, attr): string | undefined
parseJSON<T>(el, attr): T | undefined  // for ice-servers attr
```

`send-event.ts` — `dispatchTypedEvent(el, type, detail)` wrapper that builds a `CustomEvent` with `bubbles: false, composed: true, detail`.

### Task 3 — `<video-publisher>` element

**Files:** `src/elements/video-publisher.ts`, `test/unit/video-publisher.test.ts`

Observed attributes: `signaling-url`, `room`, `peer-id`, `ice-servers`, `audio` (bool), `video` (bool), `autostart` (bool), `stats-interval`, `mirror` (bool).

Lifecycle:

- `connectedCallback`: parse attrs; build `defineWebSocketSignaling` + `definePublisher`; create shadow DOM with `<video part="video">`; on `autostart`, call `getUserMedia({audio, video})` then `publisher.start()`.
- `disconnectedCallback`: `publisher.stop()`, stop media tracks, clear shadow DOM.
- Forward Publisher events as CustomEvents: `state`, `viewer`, `viewer-left`, `stats`, `error`, `ready`.

Tests cover:

- `customElements.define('video-publisher', VideoPublisherElement)` happens on import.
- Setting attributes before `connectedCallback` works (parsed in connect).
- Shadow DOM contains a `<video part="video">`.
- `mirror` attr applies CSS transform.
- `disconnectedCallback` calls `publisher.stop()`.

Note: full WebRTC flow tests deferred to EPIC-8. Here we test the element wiring + attribute observation + DOM structure.

### Task 4 — `<video-viewer>` element

**Files:** `src/elements/video-viewer.ts`, `test/unit/video-viewer.test.ts`

Observed attributes: `signaling-url`, `room`, `publisher-id`, `peer-id`, `ice-servers`, `autostart`, `stats-interval`, `muted`, `controls`.

Same shape as `<video-publisher>` but for the viewer side. On `track` event, set `videoEl.srcObject = stream`. Forward `state`, `track`, `stats`, `error` as CustomEvents.

Tests symmetric to publisher.

### Task 5 — `<video-device-picker>` element

**Files:** `src/elements/video-device-picker.ts`, `test/unit/video-device-picker.test.ts`

Observed attributes: `kind` (`camera` | `microphone` | `speaker`), `value` (selected deviceId).

Lifecycle:

- `connectedCallback`: build a light-DOM `<select>` (no shadow root — must be styleable). Subscribe to `watchDevices(cb)` from core. Populate options on each update.
- On `<select>` `change`, dispatch `CustomEvent("change", { detail: { deviceId } })` and update reflected `value` attr.
- `disconnectedCallback`: unsubscribe.

Tests:

- Renders a `<select>` in light DOM.
- `kind="camera"` shows only video input devices.
- Selecting an option fires a typed `change` CustomEvent.

### Task 6 — Auto-register entry + manual `defineElements({prefix})`

**Files:** `src/index.ts`, `src/manual.ts`, `test/unit/auto-register.test.ts`, `test/unit/manual-define.test.ts`

`src/index.ts`:

```ts
import { defineElements } from "./manual.ts";
defineElements();
export { defineElements } from "./manual.ts";
export { VideoPublisherElement } from "./elements/video-publisher.ts";
export { VideoViewerElement } from "./elements/video-viewer.ts";
export { VideoDevicePickerElement } from "./elements/video-device-picker.ts";
```

`src/manual.ts`:

```ts
export interface DefineElementsOptions {
  prefix?: string;
}
export function defineElements(opts: DefineElementsOptions = {}): void {
  const p = opts.prefix ?? "";
  if (!customElements.get(`${p}video-publisher`)) {
    customElements.define(`${p}video-publisher`, VideoPublisherElement);
  }
  // ... same for viewer + picker
}
```

Tests:

- `import "@/index.ts"` registers `video-publisher` / `video-viewer` / `video-device-picker`.
- `defineElements({ prefix: "forinda-" })` registers `forinda-video-publisher` etc.
- Re-defining is a no-op (idempotent).

### Task 7 — README + verify + tag

**Files:** `README.md`

Thorough README per docs convention. Then:

```bash
pnpm --filter @forinda/video-sdk-elements typecheck build test lint
pnpm install --frozen-lockfile
pnpm typecheck
pnpm build
pnpm lint
git tag -a v0.0.0-epic-6 -m "EPIC-6 complete: Web Components"
```

---

## Self-review notes

**Spec coverage** (against design doc Section 9):

| Spec requirement                                                | Plan task                   |
| --------------------------------------------------------------- | --------------------------- |
| Section 9 — `<video-publisher>` with full attribute set         | Task 3                      |
| Section 9 — `<video-viewer>` with full attribute set            | Task 4                      |
| Section 9 — `<video-device-picker>`                             | Task 5                      |
| Section 9 — Vanilla `HTMLElement` (no Lit/Stencil)              | Tasks 3-5                   |
| Section 9 — Shadow DOM for video elements; light DOM for picker | Tasks 3-5                   |
| Section 9 — CSS parts (`::part(video)`)                         | Tasks 3, 4                  |
| Section 9 — Auto-register on import                             | Task 6                      |
| Section 9 — Manual `defineElements({prefix})`                   | Task 6                      |
| Section 9 — Custom Elements Manifest                            | **deferred** (nice-to-have) |

**Conventions:** `defineElements` factory; inline JSDoc on every src file; `@/` alias; tsconfig split; thorough README.

## Risks and notes

- **jsdom + custom elements:** jsdom supports `customElements.define` but doesn't run `attributeChangedCallback` synchronously the same way browsers do. Tests should manually call `el.connectedCallback()` / `el.disconnectedCallback()` if jsdom's implicit invocation flakes.
- **MediaStream in jsdom:** doesn't exist. The tests fake it where needed (using `srcObject = {} as MediaStream`).
- **`getUserMedia` on connect:** the publisher element calls this on `autostart`. Tests should NOT enable `autostart` unless they also stub `navigator.mediaDevices`.
- **Element re-registration:** browsers throw if you call `customElements.define(name, ...)` twice with the same name. The `defineElements` helper guards with `customElements.get(name)` first.
- **IIFE bundle:** must work standalone via `<script src="...">`. Don't use top-level `await` or imports that won't bundle.
- **Coverage threshold lowered to 85%:** custom elements have a lot of jsdom-quirky DOM code that's hard to unit-test; integration tests in EPIC-8 cover the rest.
