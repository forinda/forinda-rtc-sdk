# example: LiveKit SFU publisher / viewer

React 18 + Vite + LiveKit demo using `useSfuPublisher` / `useSfuViewer` from `@forinda/video-sdk-react`.

## Run

1. Get a LiveKit URL + API key:
   - **Cloud (free tier):** sign up at livekit.io.
   - **Local:** `docker run --rm -p 7880:7880 livekit/livekit-server --dev`. URL becomes `ws://localhost:7880`.
2. Mint a token (Node, scoped to room + canPublish + canSubscribe — see `docs/sfu-integration.md`).
3. Set `VITE_LK_URL=wss://your-url` (or skip and edit `App.tsx`).
4. `pnpm dev:sfu`.
5. Open <http://127.0.0.1:5177> in two tabs. Paste tokens, choose roles, watch the video flow through LiveKit.

## What this demonstrates

- `useSfuPublisher({ url, token, room, peerId, stream })` — same hook shape as `usePublisher` for mesh.
- `useSfuViewer({ url, token, room, peerId, publisherId })` — auto-subscribes only to the named publisher.
- Two-transport model: chat / presence would ride our WebSocket signaling separately (not exercised in this minimal example).
