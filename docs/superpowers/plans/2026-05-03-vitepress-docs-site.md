# VitePress docs site Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a hosted documentation site at `https://forinda.github.io/forinda-rtc-sdk/` that wraps existing READMEs and `docs/*.md` in a curated VitePress narrative, plus auto-generated TypeDoc symbol pages, deployed via GitHub Actions.

**Architecture:** New private workspace package `@forinda/docs-site` at `docs-site/`. VitePress with `<!--@include-->` for READMEs and narrative docs (zero duplication). TypeDoc + `typedoc-plugin-markdown` writes per-symbol pages to `docs-site/symbols/<package>/` (gitignored). GitHub Pages deploy from `main` via `.github/workflows/docs.yml`.

**Tech Stack:** VitePress ^1.5, TypeDoc ^0.27, typedoc-plugin-markdown ^4, wireit, pnpm workspace, GitHub Pages.

**Spec:** [`docs/superpowers/specs/2026-05-03-vitepress-docs-design.md`](../specs/2026-05-03-vitepress-docs-design.md)

**IA tweak vs spec:** Symbol pages live at `/symbols/<package>/` rather than `/packages/<package>/symbols/`. Build is simpler (no rewrites or copy step) and the per-package page still links into them. Documented at the package overview page.

---

## File structure

| File                                              | Responsibility                                                                         |
| ------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `docs-site/package.json`                          | New private package `@forinda/docs-site`. Wireit `dev`/`build`/`preview`/`typedoc`.    |
| `docs-site/tsconfig.json`                         | Picks up `.vitepress/config.ts` + scripts.                                             |
| `docs-site/.vitepress/config.ts`                  | Site config — `base`, nav, sidebar, theme, search, head metadata.                      |
| `docs-site/.vitepress/theme/index.ts`             | Extends VitePress default theme.                                                       |
| `docs-site/.vitepress/theme/custom.css`           | Brand accent (left at default indigo for v1).                                          |
| `docs-site/index.md`                              | Landing page: hero, three CTAs, "what you get" feature list.                           |
| `docs-site/get-started/install.md`                | Per-stack `pnpm add` snippets + peer-dep notes.                                        |
| `docs-site/get-started/quick-start.md`            | Minimal mesh publisher walkthrough.                                                    |
| `docs-site/get-started/pick-your-stack.md`        | Decision matrix — vanilla / react / vue / elements + mesh / sfu.                       |
| `docs-site/cookbook/architecture.md`              | `<!--@include: ../../docs/architecture.md-->`                                          |
| `docs-site/cookbook/patterns.md`                  | `<!--@include: ../../docs/patterns.md-->`                                              |
| `docs-site/cookbook/sfu-integration.md`           | `<!--@include: ../../docs/sfu-integration.md-->`                                       |
| `docs-site/cookbook/troubleshooting.md`           | `<!--@include: ../../docs/troubleshooting.md-->`                                       |
| `docs-site/packages/index.md`                     | Sortable overview table + the IA-tweak note about `/symbols/`.                         |
| `docs-site/packages/core.md`                      | README include + Browse-symbols link.                                                  |
| `docs-site/packages/signaling-protocol.md`        | Same shape.                                                                            |
| `docs-site/packages/signaling-ws.md`              | Same shape.                                                                            |
| `docs-site/packages/signaling-broadcast.md`       | Same shape.                                                                            |
| `docs-site/packages/signaling-adapter-ws.md`      | Same shape.                                                                            |
| `docs-site/packages/signaling-adapter-express.md` | Same shape.                                                                            |
| `docs-site/packages/signaling-server.md`          | Same shape.                                                                            |
| `docs-site/packages/react.md`                     | Same shape.                                                                            |
| `docs-site/packages/vue.md`                       | Same shape.                                                                            |
| `docs-site/packages/elements.md`                  | Includes `packages/web-components/README.md` (directory ≠ package name).               |
| `docs-site/packages/sfu-livekit.md`               | Same shape.                                                                            |
| `docs-site/typedoc.json`                          | TypeDoc config: per-package entry points, plugin-markdown, `out: docs-site/symbols`.   |
| `docs-site/symbols/` (gitignored)                 | Generated per-symbol markdown.                                                         |
| `docs-site/scripts/smoke.mjs`                     | Post-build assertion: greps `dist/index.html` for hero string and a `/packages/` link. |
| `docs-site/README.md`                             | Local dev instructions + one-time "Pages source = Actions" note.                       |
| `docs-site/.gitignore`                            | Local ignores: `.vitepress/dist/`, `.vitepress/cache/`, `symbols/`.                    |
| `.github/workflows/docs.yml`                      | Build + deploy to GitHub Pages on `main`; build-only on PRs.                           |
| Root `package.json`                               | Add `docs:dev`, `docs:build`, `docs:preview` shortcut scripts.                         |
| Root `.gitignore`                                 | Add `docs-site/.vitepress/dist/`, `docs-site/.vitepress/cache/`, `docs-site/symbols/`. |
| Root `README.md`                                  | Add a one-line "📖 Live docs" pointer near the top.                                    |
| `.changeset/` (none)                              | docs-site is private; no changeset.                                                    |

---

## Task 1: Scaffold the `docs-site` workspace package

**Files:**

- Create: `docs-site/package.json`
- Create: `docs-site/tsconfig.json`
- Create: `docs-site/.gitignore`
- Create: `docs-site/README.md`
- Modify: root `.gitignore`

- [ ] **Step 1: Create `docs-site/package.json`**

```json
{
  "name": "@forinda/docs-site",
  "version": "0.0.0",
  "private": true,
  "description": "VitePress documentation site for the Forinda RTC SDK",
  "type": "module",
  "scripts": {
    "dev": "wireit",
    "build": "wireit",
    "preview": "vitepress preview .",
    "typedoc": "wireit"
  },
  "devDependencies": {
    "typedoc": "^0.27.0",
    "typedoc-plugin-markdown": "^4.3.0",
    "vitepress": "^1.5.0",
    "wireit": "^0.14.9"
  },
  "engines": {
    "node": ">=20.0.0"
  },
  "wireit": {
    "typedoc": {
      "command": "typedoc --options typedoc.json",
      "files": [
        "typedoc.json",
        "../packages/*/src/**/*.ts",
        "../packages/*/tsconfig.json",
        "../tsconfig.base.json"
      ],
      "output": ["symbols/**"],
      "clean": "if-file-deleted"
    },
    "build": {
      "command": "vitepress build . && node scripts/smoke.mjs",
      "files": [
        ".vitepress/**",
        "index.md",
        "get-started/**",
        "cookbook/**",
        "packages/**/*.md",
        "scripts/smoke.mjs",
        "../packages/*/README.md",
        "../docs/architecture.md",
        "../docs/patterns.md",
        "../docs/sfu-integration.md",
        "../docs/troubleshooting.md"
      ],
      "output": [".vitepress/dist/**"],
      "dependencies": ["typedoc"]
    },
    "dev": {
      "command": "vitepress dev .",
      "service": true,
      "dependencies": ["typedoc"]
    }
  }
}
```

- [ ] **Step 2: Create `docs-site/tsconfig.json`**

```json
{
  "extends": "../tsconfig.base.json",
  "compilerOptions": {
    "noEmit": true,
    "module": "ESNext",
    "moduleResolution": "bundler",
    "types": ["node"]
  },
  "include": [".vitepress/**/*.ts", "scripts/**/*.mjs"]
}
```

- [ ] **Step 3: Create `docs-site/.gitignore`**

```
.vitepress/dist/
.vitepress/cache/
symbols/
node_modules/
```

- [ ] **Step 4: Create `docs-site/README.md`**

````markdown
# @forinda/docs-site

VitePress documentation site for the Forinda RTC SDK. Private package — never published.

## Develop

```bash
pnpm install
pnpm docs:dev      # http://localhost:5173
```
````

## Build

```bash
pnpm docs:build    # outputs to docs-site/.vitepress/dist
pnpm docs:preview  # serves the built output
```

## How it stays in sync

- Per-package pages under `packages/*.md` `<!--@include-->` the upstream READMEs at build time. Touching a README rebuilds.
- Cookbook pages embed the four files under `docs/*.md` the same way.
- TypeDoc + `typedoc-plugin-markdown` generates per-symbol pages under `symbols/<package>/`. Run via `pnpm --filter @forinda/docs-site typedoc`.

## Deploy

`.github/workflows/docs.yml` builds + deploys to GitHub Pages on push to `main`.

**One-time setup** (already done if you can see the site live): repo Settings → Pages → Source = "GitHub Actions".

```

- [ ] **Step 5: Append to root `.gitignore`**

```

# docs site (generated)

docs-site/.vitepress/dist/
docs-site/.vitepress/cache/
docs-site/symbols/

````

- [ ] **Step 6: Install + verify pnpm picks it up**

Run: `pnpm install`
Expected: pnpm reports adding the new workspace project; lockfile updated.

Run: `pnpm --filter @forinda/docs-site exec node -e "console.log('ok')"`
Expected: prints `ok`.

- [ ] **Step 7: Commit**

```bash
git add docs-site/package.json docs-site/tsconfig.json docs-site/.gitignore docs-site/README.md .gitignore pnpm-lock.yaml
git commit -m "chore(docs-site): scaffold @forinda/docs-site workspace package (DOCS #1/10)"
````

---

## Task 2: VitePress config + theme

**Files:**

- Create: `docs-site/.vitepress/config.ts`
- Create: `docs-site/.vitepress/theme/index.ts`
- Create: `docs-site/.vitepress/theme/custom.css`

- [ ] **Step 1: Create `docs-site/.vitepress/config.ts`**

```ts
import { defineConfig } from "vitepress";

export default defineConfig({
  title: "Forinda RTC SDK",
  description: "Open-source, framework-agnostic WebRTC SDK — publish, view, chat, record.",
  base: "/forinda-rtc-sdk/",
  cleanUrls: true,
  lastUpdated: true,
  head: [
    ["meta", { name: "theme-color", content: "#3451b2" }],
    ["meta", { property: "og:type", content: "website" }],
    ["meta", { property: "og:title", content: "Forinda RTC SDK" }],
  ],
  themeConfig: {
    nav: [
      { text: "Get Started", link: "/get-started/install" },
      { text: "Packages", link: "/packages/" },
      { text: "Cookbook", link: "/cookbook/architecture" },
      { text: "GitHub", link: "https://github.com/forinda/forinda-rtc-sdk" },
    ],
    sidebar: {
      "/get-started/": [
        {
          text: "Get Started",
          items: [
            { text: "Install", link: "/get-started/install" },
            { text: "Quick start", link: "/get-started/quick-start" },
            { text: "Pick your stack", link: "/get-started/pick-your-stack" },
          ],
        },
      ],
      "/packages/": [
        {
          text: "Packages",
          items: [
            { text: "Overview", link: "/packages/" },
            { text: "core", link: "/packages/core" },
            { text: "signaling-protocol", link: "/packages/signaling-protocol" },
            { text: "signaling-ws", link: "/packages/signaling-ws" },
            { text: "signaling-broadcast", link: "/packages/signaling-broadcast" },
            { text: "signaling-adapter-ws", link: "/packages/signaling-adapter-ws" },
            { text: "signaling-adapter-express", link: "/packages/signaling-adapter-express" },
            { text: "signaling-server", link: "/packages/signaling-server" },
            { text: "react", link: "/packages/react" },
            { text: "vue", link: "/packages/vue" },
            { text: "elements", link: "/packages/elements" },
            { text: "sfu-livekit", link: "/packages/sfu-livekit" },
          ],
        },
      ],
      "/cookbook/": [
        {
          text: "Cookbook",
          items: [
            { text: "Architecture", link: "/cookbook/architecture" },
            { text: "Patterns", link: "/cookbook/patterns" },
            { text: "SFU integration", link: "/cookbook/sfu-integration" },
            { text: "Troubleshooting", link: "/cookbook/troubleshooting" },
          ],
        },
      ],
    },
    socialLinks: [{ icon: "github", link: "https://github.com/forinda/forinda-rtc-sdk" }],
    search: { provider: "local" },
    editLink: {
      pattern: "https://github.com/forinda/forinda-rtc-sdk/edit/main/docs-site/:path",
      text: "Edit this page on GitHub",
    },
    footer: {
      message: "Released under the MIT License.",
      copyright: "© 2026 Felix Orinda",
    },
  },
});
```

- [ ] **Step 2: Create `docs-site/.vitepress/theme/index.ts`**

```ts
import DefaultTheme from "vitepress/theme";
import "./custom.css";

export default DefaultTheme;
```

- [ ] **Step 3: Create `docs-site/.vitepress/theme/custom.css`**

```css
/* v1: keep VitePress default. Reserved for future brand tweaks. */
```

- [ ] **Step 4: Commit**

```bash
git add docs-site/.vitepress
git commit -m "feat(docs-site): VitePress config + default theme (DOCS #2/10)"
```

---

## Task 3: Landing page + Get Started

**Files:**

- Create: `docs-site/index.md`
- Create: `docs-site/get-started/install.md`
- Create: `docs-site/get-started/quick-start.md`
- Create: `docs-site/get-started/pick-your-stack.md`

- [ ] **Step 1: Create `docs-site/index.md`**

```md
---
layout: home

hero:
  name: "Forinda RTC SDK"
  text: "Framework-agnostic WebRTC."
  tagline: "Publish video, view it, chat, raise hands, share screens, and record — from plain TypeScript, React, Vue 3, or Web Components — against any signaling backend you can write."
  actions:
    - theme: brand
      text: Quick start
      link: /get-started/quick-start
    - theme: alt
      text: Browse packages
      link: /packages/
    - theme: alt
      text: Architecture →
      link: /cookbook/architecture

features:
  - title: One-publisher → many-viewers WebRTC
    details: Perfect-negotiation, retry policy, auto-reconnect, stats. Works in any modern browser.
  - title: Four consumer surfaces, one core
    details: Vanilla TS, React 18+ hooks, Vue 3 composables, standards-based Web Components.
  - title: Bring your own backend
    details: WebSocket, BroadcastChannel, Express, or write your own signaling adapter against the typed protocol.
  - title: Mesh by default, SFU when you outgrow it
    details: P2P mesh covers ≤8 viewers per publisher. The opt-in LiveKit adapter swaps in for larger broadcasts with the same Publisher / Viewer surface.
  - title: Presence, chat, and recording
    details: Built on the same signaling transport as media. Raise hand, broadcast / DM messaging, MediaRecorder with chunked uploads.
  - title: Slim bundles
    details: Browser core ~8 KB gzipped; the full publish + chat + recording stack lands under ~16 KB gzipped.
---
```

- [ ] **Step 2: Create `docs-site/get-started/install.md`**

````md
# Install

The SDK is split into small packages so you only pull what you use. Pick the rows that match your stack.

## Just publish a video stream

```bash
pnpm add @forinda/video-sdk-core @forinda/video-sdk-signaling-ws
```
````

## React app

```bash
pnpm add @forinda/video-sdk-core @forinda/video-sdk-react @forinda/video-sdk-signaling-ws
```

## Vue 3 app

```bash
pnpm add @forinda/video-sdk-core @forinda/video-sdk-vue @forinda/video-sdk-signaling-ws
```

## Web Components (any framework or none)

```bash
pnpm add @forinda/video-sdk-core @forinda/video-sdk-elements @forinda/video-sdk-signaling-ws
```

## Add the SFU adapter (optional)

For >~8 viewers per publisher, opt into the LiveKit adapter:

```bash
pnpm add @forinda/video-sdk-sfu-livekit livekit-client
```

`livekit-client` is a peer dependency — install it explicitly so mesh-only consumers stay slim. See [SFU integration](/cookbook/sfu-integration) for the two-transport model and token-minting recipe.

## Run a signaling server (dev)

```bash
pnpm add -D @forinda/video-sdk-signaling-server
forinda-rtc-signaling --port 8787
```

For production, embed the signaling engine in your existing Node server via `@forinda/video-sdk-signaling-adapter-ws` or `@forinda/video-sdk-signaling-adapter-express`.

## Compatibility

- Node ≥ 20 for the server packages.
- Browsers — Chromium 110+, Firefox 113+, Safari 16.4+.
- React ≥ 18.
- Vue ≥ 3.4.

````

- [ ] **Step 3: Create `docs-site/get-started/quick-start.md`**

```md
# Quick start

A minimal mesh publisher in 15 lines. Run a signaling server in one terminal, then load the page in two browser tabs to see the publisher / viewer flow.

## 1. Run the signaling server

```bash
pnpm dlx @forinda/video-sdk-signaling-server --port 8787
````

## 2. Publish your camera

```ts
import { definePublisher, getUserMedia } from "@forinda/video-sdk-core";
import { defineWebSocketSignaling } from "@forinda/video-sdk-signaling-ws";

const stream = await getUserMedia({ audio: true, video: true });
const publisher = definePublisher({
  signaling: defineWebSocketSignaling({ url: "ws://localhost:8787" }),
  room: "demo",
  stream,
});

publisher.on("viewer", ({ peerId }) => console.log("viewer joined:", peerId));
await publisher.start();
```

## 3. View it from another tab

```ts
import { defineViewer } from "@forinda/video-sdk-core";
import { defineWebSocketSignaling } from "@forinda/video-sdk-signaling-ws";

const viewer = defineViewer({
  signaling: defineWebSocketSignaling({ url: "ws://localhost:8787" }),
  room: "demo",
});

viewer.on("track", ({ stream }) => {
  document.querySelector("video")!.srcObject = stream;
});
await viewer.start();
```

## Next

- Add presence + chat + recording over the same socket → [Patterns](/cookbook/patterns).
- Pick the right framework adapter → [Pick your stack](/get-started/pick-your-stack).
- Outgrow mesh? → [SFU integration](/cookbook/sfu-integration).

````

- [ ] **Step 4: Create `docs-site/get-started/pick-your-stack.md`**

```md
# Pick your stack

Two questions decide what to install.

## 1. Which framework?

| You're writing… | Use this adapter                           | Page                                |
| --------------- | ------------------------------------------ | ----------------------------------- |
| Plain TypeScript / Vite / no framework | `@forinda/video-sdk-core` directly         | [core](/packages/core)              |
| React 18+       | `@forinda/video-sdk-react` (hooks + `<VideoView>`) | [react](/packages/react)            |
| Vue 3.4+        | `@forinda/video-sdk-vue` (composables + `<VideoView>`) | [vue](/packages/vue)                |
| Web Components / Lit / Stencil / no framework | `@forinda/video-sdk-elements` (4 custom elements) | [elements](/packages/elements)      |

The framework adapters are thin wrappers around `@forinda/video-sdk-core` — same lifecycle, same events, just expressed in your framework's idiom.

## 2. Mesh or SFU?

| Scale / shape                                   | Use                                                                     |
| ----------------------------------------------- | ----------------------------------------------------------------------- |
| 1-on-1 / small group (≤ 6–8 peers, full mesh)   | Mesh — `definePublisher` + `defineViewer`. Default.                     |
| 1-publisher webinar (1 → N viewers, N > ~8)     | SFU — `defineSfuPublisher` + `defineSfuViewer` via the LiveKit adapter. |
| Town-hall (2-3 publishers, many viewers)        | SFU. Same reason.                                                       |
| Recording at scale, server-side composited      | LiveKit egress directly (out of scope for the SDK).                     |

The SFU adapter has the same `Publisher` / `Viewer` shape as mesh, so swapping is one factory call. See [SFU integration](/cookbook/sfu-integration) for the full mesh→SFU migration.

## Then add what you need

- **Chat / presence / raise-hand** — `defineRoomChannel` (or `room.channel()` if you're using `defineRoom`). Rides the same WebSocket as media. See [Patterns](/cookbook/patterns).
- **Recording** — `defineRecorder(stream, { timesliceMs: 1000 })`. Ships chunks to your uploader.
- **Screen share** — `getDisplayMedia()` then feed it to a second `Publisher` with a different room name (or replace the camera track on the existing one).
````

- [ ] **Step 5: Smoke-test locally**

Run: `pnpm docs:dev` (you'll add the root script in Task 8; for now run from `docs-site/`)

Actually — until Task 8 lands, you can't run `pnpm docs:dev` yet. Just verify the files exist:

```bash
ls docs-site/index.md docs-site/get-started/*.md
```

Expected: 4 files listed.

- [ ] **Step 6: Commit**

```bash
git add docs-site/index.md docs-site/get-started/
git commit -m "feat(docs-site): landing + get-started pages (DOCS #3/10)"
```

---

## Task 4: Cookbook section (4 included narrative pages)

**Files:**

- Create: `docs-site/cookbook/architecture.md`
- Create: `docs-site/cookbook/patterns.md`
- Create: `docs-site/cookbook/sfu-integration.md`
- Create: `docs-site/cookbook/troubleshooting.md`

Each cookbook page is a thin VitePress shim that pulls in the existing `docs/*.md` source via `<!--@include-->`. The upstream files don't move and continue to render natively on GitHub.

- [ ] **Step 1: Create `docs-site/cookbook/architecture.md`**

```md
<!--@include: ../../docs/architecture.md-->
```

- [ ] **Step 2: Create `docs-site/cookbook/patterns.md`**

```md
<!--@include: ../../docs/patterns.md-->
```

- [ ] **Step 3: Create `docs-site/cookbook/sfu-integration.md`**

```md
<!--@include: ../../docs/sfu-integration.md-->
```

- [ ] **Step 4: Create `docs-site/cookbook/troubleshooting.md`**

```md
<!--@include: ../../docs/troubleshooting.md-->
```

- [ ] **Step 5: Commit**

```bash
git add docs-site/cookbook/
git commit -m "feat(docs-site): cookbook pages (architecture, patterns, sfu, troubleshooting) (DOCS #4/10)"
```

---

## Task 5: Packages overview + 11 README-include pages

**Files:**

- Create: `docs-site/packages/index.md`
- Create: `docs-site/packages/core.md`
- Create: `docs-site/packages/signaling-protocol.md`
- Create: `docs-site/packages/signaling-ws.md`
- Create: `docs-site/packages/signaling-broadcast.md`
- Create: `docs-site/packages/signaling-adapter-ws.md`
- Create: `docs-site/packages/signaling-adapter-express.md`
- Create: `docs-site/packages/signaling-server.md`
- Create: `docs-site/packages/react.md`
- Create: `docs-site/packages/vue.md`
- Create: `docs-site/packages/elements.md`
- Create: `docs-site/packages/sfu-livekit.md`

Each per-package page has the same shape: include the README, link to the symbol-level reference. The route name uses the published package short-name (`elements`); the include path uses the directory (`web-components`).

- [ ] **Step 1: Create `docs-site/packages/index.md`**

```md
# Packages

| Package                                                                       | Purpose                                                                                                                         |
| ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| [`@forinda/video-sdk-core`](./core)                                           | Framework-agnostic WebRTC publish/view core. Browser-only, ESM-only.                                                            |
| [`@forinda/video-sdk-signaling-protocol`](./signaling-protocol)               | Pure signaling engine + zod-validated wire format. Pluggable into any host.                                                     |
| [`@forinda/video-sdk-signaling-ws`](./signaling-ws)                           | Browser WebSocket signaling transport with auto-reconnect.                                                                      |
| [`@forinda/video-sdk-signaling-broadcast`](./signaling-broadcast)             | Same-tab `BroadcastChannel` transport for demos and tests.                                                                      |
| [`@forinda/video-sdk-signaling-adapter-ws`](./signaling-adapter-ws)           | Node `ws`-backed WebSocket signaling server.                                                                                    |
| [`@forinda/video-sdk-signaling-adapter-express`](./signaling-adapter-express) | Express integration (dual ESM + CJS) — share signaling with your HTTP server.                                                   |
| [`@forinda/video-sdk-signaling-server`](./signaling-server)                   | Standalone reference server + `forinda-rtc-signaling` CLI.                                                                      |
| [`@forinda/video-sdk-react`](./react)                                         | `VideoSdkProvider` + 13 hooks + `<VideoView>` component.                                                                        |
| [`@forinda/video-sdk-vue`](./vue)                                             | `VideoSdkPlugin` + 14 composables + `<VideoView>` component for Vue 3.4+.                                                       |
| [`@forinda/video-sdk-elements`](./elements)                                   | 4 Web Components: `<forinda-video-publisher>`, `<forinda-video-viewer>`, `<forinda-video-device-picker>`, `<forinda-recorder>`. |
| [`@forinda/video-sdk-sfu-livekit`](./sfu-livekit)                             | LiveKit SFU adapter — same Publisher/Viewer surface, routed through LiveKit Cloud or self-host.                                 |

> Each package page below renders the upstream `packages/<dir>/README.md` verbatim.
> For per-symbol API reference (auto-generated from JSDoc), see `/symbols/<package>/`.
```

- [ ] **Step 2: Create `docs-site/packages/core.md`**

```md
<!--@include: ../../packages/core/README.md-->

---

[Browse the per-symbol API reference for `@forinda/video-sdk-core` →](/symbols/core/)
```

- [ ] **Step 3: Create `docs-site/packages/signaling-protocol.md`**

```md
<!--@include: ../../packages/signaling-protocol/README.md-->

---

[Browse the per-symbol API reference for `@forinda/video-sdk-signaling-protocol` →](/symbols/signaling-protocol/)
```

- [ ] **Step 4: Create `docs-site/packages/signaling-ws.md`**

```md
<!--@include: ../../packages/signaling-ws/README.md-->

---

[Browse the per-symbol API reference for `@forinda/video-sdk-signaling-ws` →](/symbols/signaling-ws/)
```

- [ ] **Step 5: Create `docs-site/packages/signaling-broadcast.md`**

```md
<!--@include: ../../packages/signaling-broadcast/README.md-->

---

[Browse the per-symbol API reference for `@forinda/video-sdk-signaling-broadcast` →](/symbols/signaling-broadcast/)
```

- [ ] **Step 6: Create `docs-site/packages/signaling-adapter-ws.md`**

```md
<!--@include: ../../packages/signaling-adapter-ws/README.md-->

---

[Browse the per-symbol API reference for `@forinda/video-sdk-signaling-adapter-ws` →](/symbols/signaling-adapter-ws/)
```

- [ ] **Step 7: Create `docs-site/packages/signaling-adapter-express.md`**

```md
<!--@include: ../../packages/signaling-adapter-express/README.md-->

---

[Browse the per-symbol API reference for `@forinda/video-sdk-signaling-adapter-express` →](/symbols/signaling-adapter-express/)
```

- [ ] **Step 8: Create `docs-site/packages/signaling-server.md`**

```md
<!--@include: ../../packages/signaling-server/README.md-->

---

[Browse the per-symbol API reference for `@forinda/video-sdk-signaling-server` →](/symbols/signaling-server/)
```

- [ ] **Step 9: Create `docs-site/packages/react.md`**

```md
<!--@include: ../../packages/react/README.md-->

---

[Browse the per-symbol API reference for `@forinda/video-sdk-react` →](/symbols/react/)
```

- [ ] **Step 10: Create `docs-site/packages/vue.md`**

```md
<!--@include: ../../packages/vue/README.md-->

---

[Browse the per-symbol API reference for `@forinda/video-sdk-vue` →](/symbols/vue/)
```

- [ ] **Step 11: Create `docs-site/packages/elements.md`**

Note the include path uses the directory name `web-components`, while the route is `elements`.

```md
<!--@include: ../../packages/web-components/README.md-->

---

[Browse the per-symbol API reference for `@forinda/video-sdk-elements` →](/symbols/elements/)
```

- [ ] **Step 12: Create `docs-site/packages/sfu-livekit.md`**

```md
<!--@include: ../../packages/sfu-livekit/README.md-->

---

[Browse the per-symbol API reference for `@forinda/video-sdk-sfu-livekit` →](/symbols/sfu-livekit/)
```

- [ ] **Step 13: Commit**

```bash
git add docs-site/packages/
git commit -m "feat(docs-site): packages overview + 11 README-mirror pages (DOCS #5/10)"
```

---

## Task 6: TypeDoc + plugin-markdown for symbol pages

**Files:**

- Create: `docs-site/typedoc.json`

The TypeDoc invocation runs once and writes per-package symbol pages into `docs-site/symbols/<package>/`. The 11 published packages are explicit entry points; internal helpers (`integration-tests`, `test-helpers`) are excluded.

- [ ] **Step 1: Create `docs-site/typedoc.json`**

```json
{
  "$schema": "https://typedoc.org/schema.json",
  "entryPointStrategy": "packages",
  "entryPoints": [
    "../packages/core",
    "../packages/signaling-protocol",
    "../packages/signaling-ws",
    "../packages/signaling-broadcast",
    "../packages/signaling-adapter-ws",
    "../packages/signaling-adapter-express",
    "../packages/signaling-server",
    "../packages/react",
    "../packages/vue",
    "../packages/web-components",
    "../packages/sfu-livekit"
  ],
  "out": "symbols",
  "plugin": ["typedoc-plugin-markdown"],
  "readme": "none",
  "githubPages": false,
  "hidePageHeader": false,
  "hideBreadcrumbs": false,
  "useCodeBlocks": true,
  "expandObjects": true,
  "fileExtension": ".md",
  "skipErrorChecking": true,
  "exclude": ["**/node_modules/**", "**/test/**", "**/dist/**", "**/*.test.ts", "**/*.spec.ts"]
}
```

> `entryPointStrategy: "packages"` makes TypeDoc read each package's `package.json` for its `main`/`types` field and treat it as a separate entry. Output lands at `docs-site/symbols/<package-short-name>/`. The package short-name comes from the `name` field — e.g. `@forinda/video-sdk-elements` becomes `video-sdk-elements`. We accept that in URLs (`/symbols/video-sdk-elements/`) and add a redirect later if it becomes annoying. The "Browse symbols" links in Task 5 use short paths (`/symbols/elements/`); update them to match TypeDoc's actual output in Step 4 below if the directory names differ.

- [ ] **Step 2: Run TypeDoc to verify output**

Run: `pnpm --filter @forinda/docs-site typedoc`
Expected: TypeDoc completes, prints "Documentation generated", and `docs-site/symbols/` exists with one subdirectory per package.

If errors complain about missing entry points or `tsconfig`, check that each package's `package.json` has a valid `main` field pointing into `dist/` or `src/`.

- [ ] **Step 3: List the actual generated directory names**

```bash
ls docs-site/symbols/
```

Note the actual directory names. They will likely be the full short-names from `package.json` `name` field (e.g. `video-sdk-core`, `video-sdk-elements`, etc.).

- [ ] **Step 4: Reconcile the symbol-link targets in Task 5 pages**

For every `docs-site/packages/<name>.md` from Task 5, update the "Browse symbols" link's path to match the actual directory under `docs-site/symbols/`. For example, if TypeDoc emitted `docs-site/symbols/video-sdk-core/`, the link in `docs-site/packages/core.md` becomes:

```md
[Browse the per-symbol API reference for `@forinda/video-sdk-core` →](/symbols/video-sdk-core/)
```

Do this for all 11 package pages. (If TypeDoc instead writes to short-name dirs that already match `core`, `react`, etc., no edit is needed — but verify by listing the directory.)

- [ ] **Step 5: Commit**

```bash
git add docs-site/typedoc.json docs-site/packages/
git commit -m "feat(docs-site): TypeDoc + plugin-markdown symbol pages (DOCS #6/10)"
```

---

## Task 7: Smoke script + first end-to-end build

**Files:**

- Create: `docs-site/scripts/smoke.mjs`

The smoke script asserts that the build did what we expect — hero text on the landing page and a working link into `/packages/`. If VitePress changes its output format or our config breaks, the build fails loudly.

- [ ] **Step 1: Create `docs-site/scripts/smoke.mjs`**

```js
import { readFileSync } from "node:fs";
import { join } from "node:path";

const dist = join(import.meta.dirname, "..", ".vitepress", "dist");
const indexHtml = readFileSync(join(dist, "index.html"), "utf8");

const checks = [
  { name: "hero name", needle: "Forinda RTC SDK" },
  { name: "packages link", needle: "/packages/" },
  { name: "VitePress runtime hash", regex: /<script[^>]+app\.[A-Za-z0-9_-]+\.js/ },
];

const failures = [];
for (const check of checks) {
  const ok = check.regex ? check.regex.test(indexHtml) : indexHtml.includes(check.needle);
  if (!ok) failures.push(check.name);
}

if (failures.length > 0) {
  console.error("Smoke check failed:", failures.join(", "));
  process.exit(1);
}
console.log("Smoke check passed (" + checks.length + " assertions).");
```

- [ ] **Step 2: Run a full build end-to-end**

Run: `pnpm --filter @forinda/docs-site build`
Expected:

1. wireit runs `typedoc` (generates `docs-site/symbols/`)
2. wireit runs `vitepress build .` (writes `docs-site/.vitepress/dist/`)
3. `node scripts/smoke.mjs` runs and prints `Smoke check passed (3 assertions).`

If VitePress complains about a broken include path (e.g. `Cannot find ../../packages/<name>/README.md`), check that the package directory exists and the README is committed. If `--out` argument from TypeDoc lands somewhere unexpected, re-check `typedoc.json`.

- [ ] **Step 3: Verify the dist output**

```bash
ls docs-site/.vitepress/dist/
ls docs-site/.vitepress/dist/packages/
ls docs-site/.vitepress/dist/cookbook/
ls docs-site/.vitepress/dist/symbols/
```

Expected: each directory contains static HTML.

- [ ] **Step 4: Preview locally (optional sanity check)**

Run: `pnpm --filter @forinda/docs-site preview`
Open the printed URL. Click through Get Started → Quick start, Packages → core (verify README rendered), Cookbook → Architecture (verify mermaid block rendered, or at least the source).

> **If mermaid blocks render as plain code:** that's expected — VitePress doesn't ship mermaid by default. Out of scope for v1; document as a follow-up if it bothers you.

- [ ] **Step 5: Commit**

```bash
git add docs-site/scripts/smoke.mjs
git commit -m "feat(docs-site): smoke-check script + verified end-to-end build (DOCS #7/10)"
```

---

## Task 8: Root scripts + README pointer

**Files:**

- Modify: root `package.json`
- Modify: root `README.md`

- [ ] **Step 1: Add docs scripts to root `package.json`**

In the `"scripts"` block, after `"dev:sfu": "..."`, add:

```json
    "docs:dev": "pnpm --filter @forinda/docs-site dev",
    "docs:build": "pnpm --filter @forinda/docs-site build",
    "docs:preview": "pnpm --filter @forinda/docs-site preview",
```

- [ ] **Step 2: Verify the new scripts work**

Run: `pnpm docs:build`
Expected: same successful output as Task 7 Step 2.

Run: `pnpm docs:dev` (then Ctrl-C after the URL prints)
Expected: VitePress dev server starts on http://localhost:5173/forinda-rtc-sdk/.

- [ ] **Step 3: Add a docs link to the root `README.md`**

Find the `## Documentation` heading. Add a new line as the first content under it (above the existing bullets):

```md
📖 **Live docs:** [https://forinda.github.io/forinda-rtc-sdk/](https://forinda.github.io/forinda-rtc-sdk/)
```

- [ ] **Step 4: Format**

Run: `pnpm format`
Expected: oxfmt rewrites `package.json` and `README.md` into canonical shape; no failures.

- [ ] **Step 5: Commit**

```bash
git add package.json README.md
git commit -m "chore: add docs:dev / docs:build / docs:preview shortcuts + README pointer (DOCS #8/10)"
```

---

## Task 9: GitHub Pages workflow

**Files:**

- Create: `.github/workflows/docs.yml`

- [ ] **Step 1: Create `.github/workflows/docs.yml`**

```yaml
name: Docs

on:
  push:
    branches: [main]
    paths:
      - "docs-site/**"
      - "packages/*/README.md"
      - "packages/*/src/**"
      - "docs/architecture.md"
      - "docs/patterns.md"
      - "docs/sfu-integration.md"
      - "docs/troubleshooting.md"
      - ".github/workflows/docs.yml"
  pull_request:
    branches: [main]
    paths:
      - "docs-site/**"
      - "packages/*/README.md"
      - "packages/*/src/**"
      - "docs/architecture.md"
      - "docs/patterns.md"
      - "docs/sfu-integration.md"
      - "docs/troubleshooting.md"
      - ".github/workflows/docs.yml"
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: pages
  cancel-in-progress: false

env:
  NODE_VERSION: "22"
  PNPM_VERSION: "9.12.0"

jobs:
  build:
    name: Build docs
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with: { version: "${{ env.PNPM_VERSION }}" }
      - uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm docs:build
      - uses: actions/upload-pages-artifact@v3
        with:
          path: docs-site/.vitepress/dist

  deploy:
    name: Deploy to GitHub Pages
    if: github.event_name != 'pull_request'
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - id: deployment
        uses: actions/deploy-pages@v4
```

- [ ] **Step 2: Validate the YAML**

Run: `python3 -c "import yaml, sys; yaml.safe_load(open('.github/workflows/docs.yml'))" 2>/dev/null || echo "no python yaml; skip"`
Expected: no output (parses) or "no python yaml; skip".

If the repo has `actionlint` installed, also run `actionlint .github/workflows/docs.yml`.

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/docs.yml
git commit -m "ci: build + deploy docs site to GitHub Pages (DOCS #9/10)"
```

> **One-time manual setup after merge to `main`:** GitHub repo Settings → Pages → Source = "GitHub Actions". Workflow runs will fail to deploy until this is set; that's documented in `docs-site/README.md`.

---

## Task 10: Workspace verify, memory update, tag

**Files:**

- Modify: `~/.claude/projects/-home-forinda-dev-open-source-forinda-video-sdk/memory/feedback_thorough_readmes.md`
- Modify: `~/.claude/projects/-home-forinda-dev-open-source-forinda-video-sdk/memory/MEMORY.md`

- [ ] **Step 1: Workspace verify**

Run each in order; all must pass before tagging.

```bash
pnpm install --frozen-lockfile
pnpm typecheck
pnpm test
pnpm build
pnpm lint
pnpm docs:build
```

Expected: each exits 0. The `docs:build` step asserts the smoke check too.

- [ ] **Step 2: Update the memory note about READMEs being the only docs**

The existing memory file says "no separate documentation site". That's no longer accurate after this work. Edit `~/.claude/projects/-home-forinda-dev-open-source-forinda-video-sdk/memory/feedback_thorough_readmes.md`:

Replace the body line:

> There is no separate documentation site for this monorepo (planned for a later slice but not v0.1.0). Each package's README must therefore stand alone as the canonical user-facing documentation.

with:

> Each package's README is the **single source of truth** for its API, even though `@forinda/docs-site` (VitePress) now embeds them at `https://forinda.github.io/forinda-rtc-sdk/packages/<name>`. Editing a README rebuilds and redeploys the docs site automatically — never duplicate content into `docs-site/`. Per-symbol auto-generated reference pages live under `/symbols/<package>/` (TypeDoc) and supplement, not replace, the README.

Also update the `description:` frontmatter line to drop "There is no separate documentation site." and replace with "Each README is the single source of truth; the VitePress site embeds them rather than duplicates them."

`MEMORY.md` index entry for this memory currently reads:

```
- [Package READMEs are the documentation](feedback_thorough_readmes.md) — no separate docs site; each README must stand alone with full options/usage/behavior reference
```

Replace with:

```
- [Package READMEs are the documentation source-of-truth](feedback_thorough_readmes.md) — VitePress site embeds READMEs (never duplicate); each README must stand alone with full options/usage/behavior reference
```

- [ ] **Step 3: Tag**

```bash
git tag -a v0.0.0-docs-site -m "docs-site: VitePress documentation site (DOCS #1-10)"
git tag --list 'v0.0.0-docs-site'
```

Expected: `v0.0.0-docs-site` appears in the list.

- [ ] **Step 4: Push (only if/when ready — confirm with the user first)**

Don't run this without confirmation. Once approved:

```bash
git push origin main --tags
```

After the first push to `main`, the workflow will fail at the deploy step until the user enables Pages = GitHub Actions in repo settings (documented in `docs-site/README.md`).

---

## Acceptance criteria (from spec)

- ✅ Site builds locally via `pnpm docs:dev` (Task 7 Step 4 + Task 8 Step 2).
- ✅ `pnpm docs:build` produces `docs-site/.vitepress/dist/` with all nav routes resolvable (Task 7 Step 3).
- ✅ Smoke check passes (Task 7 Step 2).
- ✅ Workflow deploys to GitHub Pages on merge to `main` (Task 9; verified after first push + manual Pages-source enable).
- ✅ Each `/packages/<name>` page renders the upstream README content verbatim (Task 5; spot-check in Task 7 Step 4).
- ✅ `/symbols/<package>/` lists every public export from `packages/<name>/src/index.ts` (Task 6 Step 2 + Step 3).
- ✅ Cookbook pages embed the four `docs/*.md` files unchanged (Task 4).
- ✅ Local search returns hits for "publisher", "viewer", "sfu", "raise hand" (manual verification during Task 7 Step 4).
- ✅ Memory updated to reflect the new docs site source-of-truth invariant (Task 10 Step 2).

## Out of scope (locked in spec)

- Custom domain.
- Algolia DocSearch.
- i18n.
- Versioned docs.
- Moving `docs/*.md` files into `docs-site/`.
- Wiring `docs:build` into root `pnpm build` (kept as a separate target so package CI stays fast).
- Logo / brand mark.
