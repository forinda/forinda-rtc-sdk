# example: vue publisher / viewer

Vue 3 + Vite 8 demo using `VideoSdkPlugin`, `useUserMedia`, `usePublisher`, `useViewer`, and `<VideoView>` from `@forinda/video-sdk-vue`.

## Run

```bash
# terminal 1 — local signaling server on ws://127.0.0.1:8787
pnpm dev:server

# terminal 2 — Vite dev server on http://127.0.0.1:5176
pnpm dev:vue
```

Open `http://127.0.0.1:5176` in two tabs:

1. Tab A — click **Publish**. Copy the printed `peerId`.
2. Tab B — paste the `peerId` into the input, click **View**.

## What this demonstrates

- `app.use(VideoSdkPlugin, { signaling: () => defineWebSocketSignaling({...}) })` — factory pattern, fresh transport per composable.
- `useUserMedia({ audio, video })` with auto cleanup on scope dispose.
- `usePublisher({ room, stream })` and `useViewer({ room, publisherId })` reactive composables.
- `<VideoView :stream="...">` handles `srcObject` and exposes the underlying `<video>` via `defineExpose`.
- Camera-to-screenshare swap via `publisher.replaceVideoTrack(...)` driven by `useDisplayMedia`.
