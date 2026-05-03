# Install

The SDK is split into small packages so you only pull what you use. Pick the rows that match your stack.

## Just publish a video stream

```bash
pnpm add @forinda/video-sdk-core @forinda/video-sdk-signaling-ws
```

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
