# example: react publisher / viewer

React 18 + Vite 8 demo using `<VideoSdkProvider>`, `useUserMedia`, `usePublisher`, `useViewer`, and `<VideoView>` from `@forinda/video-sdk-react`.

## Run

```bash
# terminal 1 — local signaling server on ws://127.0.0.1:8787
pnpm dev:server

# terminal 2 — Vite dev server on http://127.0.0.1:5174
pnpm dev:react
```

Open `http://127.0.0.1:5174` in two tabs:

1. Tab A — click **Publish**. Copy the printed `peerId`.
2. Tab B — paste the `peerId` into the input, click **View**.

## What this demonstrates

- `<VideoSdkProvider signaling={() => defineWebSocketSignaling({...})}>` — factory pattern, fresh transport per hook.
- `useUserMedia({ audio, video })` with auto cleanup (StrictMode safe).
- `usePublisher({ room, stream })` and `useViewer({ room, publisherId })` snapshot hooks.
- `<VideoView stream={...}>` handles `srcObject` and ref forwarding.
