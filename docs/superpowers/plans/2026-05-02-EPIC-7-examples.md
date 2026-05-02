# EPIC-7 Examples + Dev Server Implementation Plan

> **For agentic workers:** Steps use checkbox (`- [ ]`) syntax for tracking. Execute task-by-task with verification after each.

**Goal:** Ship 3 working example apps (vanilla / React / web-components) plus a runnable `apps/dev-signaling-server`, all wired through workspace scripts.

**Architecture:** Each example is a standalone Vite app under `examples/`, depending on the appropriate published-from-workspace package. They all point at `ws://localhost:8787` provided by `apps/dev-signaling-server`. Examples are `private: true` and not published to npm.

**Tech Stack:** Vite 5, React 18 (for the React example), plain TS for vanilla, plain HTML+TS for web-components example. No CSS frameworks — minimal inline styles.

---

## File Structure

- `apps/dev-signaling-server/src/index.ts` — wires `defineSignalingServer` and starts on port 8787.
- `examples/vanilla-publisher-viewer/` — Vite + TS app with `index.html`, `src/main.ts`, `vite.config.ts`, `tsconfig.json`, `package.json`, `README.md`.
- `examples/react-publisher-viewer/` — Vite + React + TS app with `index.html`, `src/main.tsx`, `src/App.tsx`, `vite.config.ts`, `tsconfig.json`, `package.json`, `README.md`.
- `examples/web-components-publisher-viewer/` — Vite + plain HTML+TS app with `index.html`, `src/main.ts`, `vite.config.ts`, `package.json`, `README.md`.
- Root `package.json` — add `dev:server` script.
- Root `README.md` — append "Try the examples" section.

---

## Task 1: Wire `apps/dev-signaling-server`

**Files:**

- Modify: `apps/dev-signaling-server/src/index.ts`

- [ ] **Step 1: Replace placeholder with a `defineSignalingServer` boot script**

```ts
/**
 * Local dev signaling server — boots `defineSignalingServer` on port 8787.
 *
 * Started by `pnpm dev:server` from the repo root; consumed by the example
 * apps under `examples/`.
 */

import { defineSignalingServer } from "@forinda/video-sdk-signaling-server";

const PORT = Number(process.env.PORT ?? 8787);
const HOST = process.env.HOST ?? "127.0.0.1";

const server = defineSignalingServer({ port: PORT, host: HOST });
await server.start();

console.log(`[dev-signaling-server] listening on ws://${HOST}:${PORT}`);

const shutdown = async (signal: string): Promise<void> => {
  console.log(`[dev-signaling-server] received ${signal}, shutting down`);
  await server.stop();
  process.exit(0);
};
process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
```

- [ ] **Step 2: Verify the script starts**

Run: `pnpm --filter dev-signaling-server dev` (from repo root)
Expected: log line `[dev-signaling-server] listening on ws://127.0.0.1:8787`. Ctrl-C cleanly exits.

- [ ] **Step 3: Commit**

```bash
git add apps/dev-signaling-server/src/index.ts
git commit -m "feat(dev-signaling-server): wire defineSignalingServer with graceful shutdown"
```

---

## Task 2: Add root `dev:server` script

**Files:**

- Modify: `package.json`

- [ ] **Step 1: Add `dev:server` to root scripts**

```json
"scripts": {
  ...,
  "dev:server": "pnpm --filter dev-signaling-server dev"
}
```

- [ ] **Step 2: Verify**

Run: `pnpm dev:server` (Ctrl-C after the listen log appears)
Expected: same log as Task 1.

- [ ] **Step 3: Commit**

```bash
git add package.json
git commit -m "chore: add dev:server root script"
```

---

## Task 3: Vanilla example app

**Files:**

- Create: `examples/vanilla-publisher-viewer/package.json`
- Create: `examples/vanilla-publisher-viewer/tsconfig.json`
- Create: `examples/vanilla-publisher-viewer/vite.config.ts`
- Create: `examples/vanilla-publisher-viewer/index.html`
- Create: `examples/vanilla-publisher-viewer/src/main.ts`
- Create: `examples/vanilla-publisher-viewer/README.md`

- [ ] **Step 1: Write `package.json`**

```json
{
  "name": "example-vanilla-publisher-viewer",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "@forinda/video-sdk-core": "workspace:*",
    "@forinda/video-sdk-signaling-ws": "workspace:*"
  },
  "devDependencies": {
    "typescript": "^6.0.0",
    "vite": "^5.4.0"
  }
}
```

- [ ] **Step 2: Write `tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "rootDir": ".",
    "noEmit": true,
    "lib": ["ES2022", "DOM", "DOM.Iterable"]
  },
  "include": ["src/**/*.ts", "vite.config.ts"]
}
```

- [ ] **Step 3: Write `vite.config.ts`**

```ts
import { defineConfig } from "vite";

export default defineConfig({
  server: { port: 5173, strictPort: true },
});
```

- [ ] **Step 4: Write `index.html`**

```html
<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Vanilla publisher / viewer</title>
    <style>
      body {
        font-family: system-ui;
        margin: 2rem;
      }
      video {
        width: 480px;
        max-width: 100%;
        background: #111;
        border-radius: 8px;
      }
      .row {
        display: flex;
        gap: 1rem;
        align-items: center;
      }
      .mirror {
        transform: scaleX(-1);
      }
    </style>
  </head>
  <body>
    <h1>Vanilla publisher / viewer</h1>
    <p>
      Open this page once per role. Roles are selected via the URL hash (#publisher or
      #viewer:&lt;publisherId&gt;).
    </p>
    <div id="links" class="row"></div>
    <hr />
    <div id="status">choose a role…</div>
    <video id="video" autoplay playsinline muted></video>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
```

- [ ] **Step 5: Write `src/main.ts`**

```ts
import { definePublisher, defineViewer, type ConnectionState } from "@forinda/video-sdk-core";
import { defineWebSocketSignaling } from "@forinda/video-sdk-signaling-ws";

const SIGNALING_URL = "ws://127.0.0.1:8787";
const ROOM = "demo";

const statusEl = document.querySelector<HTMLDivElement>("#status")!;
const videoEl = document.querySelector<HTMLVideoElement>("#video")!;
const linksEl = document.querySelector<HTMLDivElement>("#links")!;

function setStatus(msg: string): void {
  statusEl.textContent = msg;
}

function makeLink(href: string, text: string): HTMLAnchorElement {
  const a = document.createElement("a");
  a.href = href;
  a.textContent = text;
  return a;
}

function renderLinks(publisherId?: string): void {
  linksEl.replaceChildren();
  linksEl.appendChild(makeLink("#publisher", "publish"));
  linksEl.append(" | ");
  if (publisherId) {
    linksEl.appendChild(makeLink(`#viewer:${publisherId}`, "view this publisher"));
  } else {
    linksEl.append("(no publisher id yet)");
  }
}

async function runPublisher(): Promise<void> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
  videoEl.srcObject = stream;
  videoEl.classList.add("mirror");

  const signaling = defineWebSocketSignaling({ url: SIGNALING_URL });
  const publisher = definePublisher({ signaling, room: ROOM, stream });

  publisher.on("state", (s: ConnectionState) => setStatus(`publisher: ${s}`));
  publisher.on("viewer", ({ peerId }) => setStatus(`viewer joined: ${peerId}`));
  publisher.on("error", (err) => setStatus(`error: ${err.message}`));

  await publisher.start();
  renderLinks(publisher.peerId);
  setStatus(`publisher ready — peerId=${publisher.peerId}`);
}

async function runViewer(publisherId: string): Promise<void> {
  videoEl.muted = false;
  const signaling = defineWebSocketSignaling({ url: SIGNALING_URL });
  const viewer = defineViewer({ signaling, room: ROOM, publisherId });

  viewer.on("state", (s: ConnectionState) => setStatus(`viewer: ${s}`));
  viewer.on("track", ({ stream }) => {
    videoEl.srcObject = stream;
  });
  viewer.on("error", (err) => setStatus(`error: ${err.message}`));

  await viewer.start();
  setStatus(`viewer subscribed to ${publisherId}`);
}

function dispatch(): void {
  const hash = location.hash.slice(1);
  renderLinks();
  if (hash === "publisher") {
    void runPublisher();
  } else if (hash.startsWith("viewer:")) {
    void runViewer(hash.slice("viewer:".length));
  }
}

window.addEventListener("hashchange", () => location.reload());
dispatch();
```

- [ ] **Step 6: Write `README.md`**

```markdown
# example: vanilla publisher / viewer

Plain TS demo using `definePublisher` and `defineViewer` from core, plus the WS signaling client.

## Run

# terminal 1

pnpm dev:server

# terminal 2

pnpm --filter example-vanilla-publisher-viewer dev

Open http://127.0.0.1:5173/#publisher in one tab. Copy the printed peerId, then open http://127.0.0.1:5173/#viewer:<peerId> in another tab to subscribe.
```

- [ ] **Step 7: Install + verify**

Run from repo root: `pnpm install`
Run: `pnpm --filter example-vanilla-publisher-viewer build`
Expected: build succeeds, no type errors.

- [ ] **Step 8: Commit**

```bash
git add examples/vanilla-publisher-viewer pnpm-lock.yaml
git commit -m "feat(examples): vanilla publisher/viewer Vite app"
```

---

## Task 4: React example app

**Files:**

- Create: `examples/react-publisher-viewer/package.json`
- Create: `examples/react-publisher-viewer/tsconfig.json`
- Create: `examples/react-publisher-viewer/vite.config.ts`
- Create: `examples/react-publisher-viewer/index.html`
- Create: `examples/react-publisher-viewer/src/main.tsx`
- Create: `examples/react-publisher-viewer/src/App.tsx`
- Create: `examples/react-publisher-viewer/README.md`

- [ ] **Step 1: Write `package.json`**

```json
{
  "name": "example-react-publisher-viewer",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "@forinda/video-sdk-core": "workspace:*",
    "@forinda/video-sdk-react": "workspace:*",
    "@forinda/video-sdk-signaling-ws": "workspace:*",
    "react": "^18.3.1",
    "react-dom": "^18.3.1"
  },
  "devDependencies": {
    "@types/react": "^18.3.0",
    "@types/react-dom": "^18.3.0",
    "@vitejs/plugin-react": "^4.3.0",
    "typescript": "^6.0.0",
    "vite": "^5.4.0"
  }
}
```

- [ ] **Step 2: Write `tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "rootDir": ".",
    "noEmit": true,
    "jsx": "react-jsx",
    "lib": ["ES2022", "DOM", "DOM.Iterable"]
  },
  "include": ["src/**/*.ts", "src/**/*.tsx", "vite.config.ts"]
}
```

- [ ] **Step 3: Write `vite.config.ts`**

```ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: { port: 5174, strictPort: true },
});
```

- [ ] **Step 4: Write `index.html`**

```html
<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>React publisher / viewer</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 5: Write `src/main.tsx`**

```tsx
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.tsx";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
```

- [ ] **Step 6: Write `src/App.tsx`**

```tsx
import { useState } from "react";
import {
  VideoSdkProvider,
  VideoView,
  usePublisher,
  useUserMedia,
  useViewer,
} from "@forinda/video-sdk-react";
import { defineWebSocketSignaling } from "@forinda/video-sdk-signaling-ws";

const SIGNALING_URL = "ws://127.0.0.1:8787";
const ROOM = "demo";

function Publisher(): JSX.Element {
  const { stream, error: mediaError } = useUserMedia({ audio: true, video: true });
  const { state, viewers, publisher } = usePublisher({ room: ROOM, stream });

  return (
    <section>
      <h2>Publisher</h2>
      <VideoView stream={stream} muted autoPlay playsInline mirror style={style.video} />
      <p>state: {state}</p>
      <p>viewers: {viewers.length}</p>
      <p>
        peerId: <code>{publisher?.peerId ?? "—"}</code>
      </p>
      {mediaError && <p style={style.err}>media error: {mediaError.message}</p>}
    </section>
  );
}

function Viewer({ publisherId }: { publisherId: string }): JSX.Element {
  const { state, stream, error } = useViewer({ room: ROOM, publisherId });
  return (
    <section>
      <h2>Viewer</h2>
      <VideoView stream={stream} autoPlay playsInline style={style.video} />
      <p>state: {state}</p>
      {error && <p style={style.err}>error: {error.message}</p>}
    </section>
  );
}

export function App(): JSX.Element {
  const [role, setRole] = useState<"publisher" | "viewer" | null>(null);
  const [pubId, setPubId] = useState<string>("");

  return (
    <VideoSdkProvider signaling={() => defineWebSocketSignaling({ url: SIGNALING_URL })}>
      <main style={style.main}>
        <h1>React publisher / viewer</h1>
        <div style={style.row}>
          <button type="button" onClick={() => setRole("publisher")}>
            Publish
          </button>
          <input
            type="text"
            placeholder="publisher peerId"
            value={pubId}
            onChange={(e) => setPubId(e.target.value)}
          />
          <button type="button" disabled={!pubId} onClick={() => setRole("viewer")}>
            View
          </button>
        </div>
        {role === "publisher" && <Publisher />}
        {role === "viewer" && <Viewer publisherId={pubId} />}
      </main>
    </VideoSdkProvider>
  );
}

const style = {
  main: { fontFamily: "system-ui", margin: "2rem" } as const,
  row: { display: "flex", gap: "0.5rem", marginBottom: "1rem" } as const,
  video: { width: 480, maxWidth: "100%", background: "#111", borderRadius: 8 } as const,
  err: { color: "crimson" } as const,
};
```

- [ ] **Step 7: Write `README.md`**

```markdown
# example: react publisher / viewer

React 18 + Vite demo using `<VideoSdkProvider>`, `useUserMedia`, `usePublisher`, `useViewer`, `<VideoView>`.

## Run

# terminal 1

pnpm dev:server

# terminal 2

pnpm --filter example-react-publisher-viewer dev

Open http://127.0.0.1:5174 in two tabs.
```

- [ ] **Step 8: Install + verify**

Run: `pnpm install && pnpm --filter example-react-publisher-viewer build`
Expected: build succeeds.

- [ ] **Step 9: Commit**

```bash
git add examples/react-publisher-viewer pnpm-lock.yaml
git commit -m "feat(examples): React publisher/viewer Vite app"
```

---

## Task 5: Web Components example app

**Files:**

- Create: `examples/web-components-publisher-viewer/package.json`
- Create: `examples/web-components-publisher-viewer/tsconfig.json`
- Create: `examples/web-components-publisher-viewer/vite.config.ts`
- Create: `examples/web-components-publisher-viewer/index.html`
- Create: `examples/web-components-publisher-viewer/src/main.ts`
- Create: `examples/web-components-publisher-viewer/README.md`

- [ ] **Step 1: Write `package.json`**

```json
{
  "name": "example-web-components-publisher-viewer",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "@forinda/video-sdk-core": "workspace:*",
    "@forinda/video-sdk-elements": "workspace:*",
    "@forinda/video-sdk-signaling-ws": "workspace:*"
  },
  "devDependencies": {
    "typescript": "^6.0.0",
    "vite": "^5.4.0"
  }
}
```

- [ ] **Step 2: Write `tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "rootDir": ".",
    "noEmit": true,
    "lib": ["ES2022", "DOM", "DOM.Iterable"]
  },
  "include": ["src/**/*.ts", "vite.config.ts"]
}
```

- [ ] **Step 3: Write `vite.config.ts`**

```ts
import { defineConfig } from "vite";

export default defineConfig({
  server: { port: 5175, strictPort: true },
});
```

- [ ] **Step 4: Write `index.html`**

```html
<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Web Components publisher / viewer</title>
    <style>
      body {
        font-family: system-ui;
        margin: 2rem;
      }
      forinda-video-publisher,
      forinda-video-viewer {
        width: 480px;
        max-width: 100%;
        aspect-ratio: 16 / 9;
        background: #111;
        border-radius: 8px;
      }
      forinda-video-publisher::part(video),
      forinda-video-viewer::part(video) {
        border-radius: 8px;
      }
      .row {
        display: flex;
        gap: 0.5rem;
        margin-bottom: 1rem;
      }
    </style>
  </head>
  <body>
    <h1>Web Components publisher / viewer</h1>
    <div class="row">
      <button id="publish-btn" type="button">Publish</button>
      <input id="pub-id" type="text" placeholder="publisher peerId" />
      <button id="view-btn" type="button">View</button>
      <forinda-video-device-picker kind="camera" placeholder="Camera"></forinda-video-device-picker>
    </div>
    <div id="slot"></div>
    <p id="status">choose a role…</p>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
```

- [ ] **Step 5: Write `src/main.ts`**

```ts
import "@forinda/video-sdk-elements";

const SIGNALING_URL = "ws://127.0.0.1:8787";
const ROOM = "demo";

const slot = document.querySelector<HTMLDivElement>("#slot")!;
const status = document.querySelector<HTMLParagraphElement>("#status")!;
const pubInput = document.querySelector<HTMLInputElement>("#pub-id")!;

function setStatus(msg: string): void {
  status.textContent = msg;
}

function mountPublisher(): void {
  slot.replaceChildren();
  const pub = document.createElement("forinda-video-publisher");
  pub.setAttribute("room", ROOM);
  pub.setAttribute("signaling-url", SIGNALING_URL);
  pub.setAttribute("audio", "");
  pub.setAttribute("video", "");
  pub.setAttribute("mirror", "");
  pub.addEventListener("ready", (e) => {
    const detail = (e as CustomEvent<{ publisher: { peerId: string } }>).detail;
    setStatus(`publisher ready — peerId=${detail.publisher.peerId}`);
  });
  pub.addEventListener("error", (e) => {
    setStatus(`error: ${(e as CustomEvent<Error>).detail.message}`);
  });
  slot.appendChild(pub);
}

function mountViewer(publisherId: string): void {
  slot.replaceChildren();
  const view = document.createElement("forinda-video-viewer");
  view.setAttribute("room", ROOM);
  view.setAttribute("publisher-id", publisherId);
  view.setAttribute("signaling-url", SIGNALING_URL);
  view.addEventListener("track", () => setStatus(`viewing ${publisherId}`));
  view.addEventListener("error", (e) => {
    setStatus(`error: ${(e as CustomEvent<Error>).detail.message}`);
  });
  slot.appendChild(view);
}

document.querySelector("#publish-btn")!.addEventListener("click", mountPublisher);
document.querySelector("#view-btn")!.addEventListener("click", () => {
  if (pubInput.value) mountViewer(pubInput.value);
});
```

- [ ] **Step 6: Write `README.md`**

```markdown
# example: web components publisher / viewer

Plain HTML + Vite using `<forinda-video-publisher>`, `<forinda-video-viewer>`, and `<forinda-video-device-picker>`.

## Run

# terminal 1

pnpm dev:server

# terminal 2

pnpm --filter example-web-components-publisher-viewer dev

Open http://127.0.0.1:5175 in two tabs.
```

- [ ] **Step 7: Install + verify**

Run: `pnpm install && pnpm --filter example-web-components-publisher-viewer build`
Expected: build succeeds.

- [ ] **Step 8: Commit**

```bash
git add examples/web-components-publisher-viewer pnpm-lock.yaml
git commit -m "feat(examples): web-components publisher/viewer Vite app"
```

---

## Task 6: Update root README + tag

**Files:**

- Modify: `README.md`

- [ ] **Step 1: Append "Try the examples" section**

(Use a level-2 heading and three pnpm commands per example.)

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: add 'Try the examples' section to root README"
```

- [ ] **Step 3: Tag the milestone**

```bash
git tag -a v0.0.0-epic-7 -m "EPIC-7: 3 example apps + dev signaling server"
```
