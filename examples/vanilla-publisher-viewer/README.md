# example: vanilla publisher / viewer

Plain TS + Vite demo using `definePublisher` and `defineViewer` from `@forinda/video-sdk-core`, with the WebSocket signaling client.

## Run

```bash
# terminal 1 — local signaling server on ws://127.0.0.1:8787
pnpm dev:server

# terminal 2 — Vite dev server on http://127.0.0.1:5173
pnpm dev:vanilla
```

1. Open `http://127.0.0.1:5173/#publisher` — grant camera/mic permission.
2. Copy the `peerId` printed in the status line.
3. Open `http://127.0.0.1:5173/#viewer:<peerId>` in another tab to subscribe.

## What this demonstrates

- `definePublisher({ signaling, room, stream })` — one-call construction.
- `defineViewer({ signaling, room, publisherId })` — symmetric receiver.
- `defineWebSocketSignaling({ url })` — WS transport.
- Wiring the receiver's `track` event into a `<video>`'s `srcObject`.
