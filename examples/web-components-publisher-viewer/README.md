# example: web components publisher / viewer

Plain HTML + Vite 8 demo using `<forinda-video-publisher>`, `<forinda-video-viewer>`, and `<forinda-video-device-picker>` from `@forinda/video-sdk-elements`.

## Run

```bash
# terminal 1 — local signaling server on ws://127.0.0.1:8787
pnpm dev:server

# terminal 2 — Vite dev server on http://127.0.0.1:5175
pnpm dev:elements
```

Open `http://127.0.0.1:5175` in two tabs:

1. Tab A — click **Publish**, copy the printed `peerId`.
2. Tab B — paste the `peerId`, click **View**.

## What this demonstrates

- Importing `@forinda/video-sdk-elements` registers all three custom elements automatically.
- Element attributes (`room`, `signaling-url`, `audio`, `video`, `mirror`) drive lifecycle.
- `ready`, `track`, `error` `CustomEvent`s for status updates.
- `<forinda-video-device-picker kind="camera">` for live device enumeration.
- Per-element `::part(video)` styling.
