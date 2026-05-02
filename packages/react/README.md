# @forinda/video-sdk-react

React 18+ hooks and components for the Forinda RTC SDK. Provides ergonomic wrappers around the framework-agnostic `Publisher` / `Viewer` from `@forinda/video-sdk-core`.

## Install

```bash
pnpm add @forinda/video-sdk-react @forinda/video-sdk-core react react-dom
```

> Peer deps: `@forinda/video-sdk-core`, `react@>=18`. The hooks rely on `useSyncExternalStore`, so React 17 isn't supported.

## Quick start

```tsx
import { VideoSdkProvider, usePublisher, useUserMedia, VideoView } from "@forinda/video-sdk-react";
import { defineWebSocketSignaling } from "@forinda/video-sdk-signaling-ws";

function App() {
  return (
    <VideoSdkProvider
      signaling={() => defineWebSocketSignaling({ url: "wss://signal.example.com" })}
      iceServers={[{ urls: "stun:stun.l.google.com:19302" }]}
    >
      <Broadcast />
    </VideoSdkProvider>
  );
}

function Broadcast() {
  const { stream } = useUserMedia({ audio: true, video: true });
  const { state, viewers } = usePublisher({ room: "demo", stream });

  return (
    <>
      <VideoView stream={stream} muted autoPlay playsInline mirror />
      <p>
        state: {state}, viewers: {viewers.length}
      </p>
    </>
  );
}
```

## Hooks

### `useUserMedia(opts)`

Request a `MediaStream`, manage tracks, expose state.

```ts
const { stream, error, state, refresh, stop } = useUserMedia({ audio: true, video: true });
// state: "idle" | "requesting" | "granted" | "denied" | "error"
```

Cleans up tracks on unmount; uses `AbortController` so StrictMode double-mount in dev is idempotent. SSR-safe (returns `{ stream: null, state: "idle" }` on the server).

### `useDisplayMedia(opts?)`

Request a screen-share `MediaStream` via `getDisplayMedia`. Defaults to **manual start** (most apps want a button click), with `{ autoStart: true }` to open the picker on mount.

```ts
const { stream, state, start, stop } = useDisplayMedia();
// state: "idle" | "requesting" | "granted" | "denied" | "ended" | "error"

await start(); // opens browser picker
// later:
publisher?.replaceVideoTrack(stream!.getVideoTracks()[0]); // swap into existing publisher
```

The `"ended"` state fires when the user clicks the browser's own "Stop sharing" pill — wire it to swap back to the camera or unmount.

### `useDevices()`

Subscribe to camera/mic/speaker enumeration with hotplug auto-refresh.

```ts
const { cameras, microphones, speakers, refresh } = useDevices();
```

### `usePublisher(opts)`

Construct + manage a `Publisher`. Subscribes to all the events you care about and exposes them as a snapshot.

```ts
const {
  publisher,
  state,
  viewers,
  stats,
  error,
  start,
  stop,
  replaceVideoTrack,
  replaceAudioTrack,
} = usePublisher({
  room: "demo",
  stream, // from useUserMedia
  autoStart: true, // default
  stats: { interval: 1000 }, // optional
});
```

If `signaling` / `iceServers` / `retry` aren't supplied, the hook falls back to the nearest `VideoSdkProvider`.

### `useViewer(opts)`

Symmetric to `usePublisher` for the viewer side.

```ts
const { viewer, state, stream, stats, error, start, stop } = useViewer({
  room: "demo",
  publisherId: "alice",
  autoStart: true,
});
```

`stream` is `null` until the first `track` event fires; pass it to `<VideoView>`.

### `useConnectionStats(publisherOrViewer, { interval? })`

Standalone hook for consumers managing their own Publisher/Viewer who want stats.

```ts
const stats = useConnectionStats(publisher); // ConnectionStats[]
const oneViewer = useConnectionStats(viewer); // ConnectionStats | null
```

### `useRoomChannel(opts)`

Construct a `RoomChannel` (presence + chat) for the lifetime of the calling component. Falls back to `VideoSdkProvider`'s signaling factory when `opts.signaling` is omitted.

```ts
const { channel, error } = useRoomChannel({ room: "demo", peerId: "alice" });
```

| Option             | Default               | Description                                                                       |
| ------------------ | --------------------- | --------------------------------------------------------------------------------- |
| `room`             | —                     | Required.                                                                         |
| `peerId`           | `crypto.randomUUID()` | Self id.                                                                          |
| `signaling`        | from provider         | Pre-built `SignalingTransport`.                                                   |
| `manageJoin`       | `true`                | Issue join + leave. Set `false` when sharing a transport with a Publisher/Viewer. |
| `chatHistoryLimit` | `200`                 | Rolling chat-buffer cap.                                                          |
| `autoStart`        | `true`                | Call `channel.start()` on mount.                                                  |

### `usePresence(channel)`

Live snapshot of every peer's attributes plus stable write callbacks. Re-renders on `presence`, `presence-snapshot`, and `peer-left` events.

```ts
const { peers, setAttribute, removeAttribute, clearAttributes } = usePresence(channel);
// peers: Record<peerId, Record<string, JsonValue>>
await setAttribute("status", "🎬");
```

### `useChat(channel)`

Live chat history plus a stable `send` callback. Omit `to` for a room-wide broadcast; pass a peerId for a DM.

```ts
const { messages, send } = useChat(channel);
await send("hello room");
await send("psst", { to: "bob" });
```

### `useRaiseHand(channel)`

Sugar over `usePresence` for the most common interaction pattern. Reads the channel peer's own `"hand-raised"` attribute.

```ts
const { raised, raise, lower, toggle } = useRaiseHand(channel);
```

## Components

### `<VideoView stream={...} />`

`<video>` wrapper that handles `srcObject` (which doesn't fit React's prop model) and forwards refs. Optional `mirror` prop applies `transform: scaleX(-1)` for selfie preview.

```tsx
<VideoView stream={stream} muted autoPlay playsInline mirror />
```

Forwards every other `<video>` attribute (`controls`, `poster`, `className`, `style`, …).

## Provider

### `<VideoSdkProvider signaling={...} iceServers={...} retry={...}>`

Optional context — supplies default config to all hooks. Per-hook overrides win.

`signaling` is a **factory** (not an instance) so each `usePublisher` / `useViewer` gets its own transport. Multiple instances in one tree don't fight over one socket.

```tsx
<VideoSdkProvider
  signaling={() => defineWebSocketSignaling({ url: "wss://..." })}
  iceServers={[{ urls: "stun:stun.l.google.com:19302" }]}
  retry={{ maxAttempts: 5 }}
>
  <App />
</VideoSdkProvider>
```

## Behavior

### StrictMode

Every effect uses `AbortController` cleanup. The dev-only mount→unmount→remount pattern is idempotent: torn-down media streams are stopped, and the remount fires a fresh request.

### SSR

- `useUserMedia` and `useDevices` early-return inert state on the server (`typeof window === "undefined"`).
- `usePublisher` and `useViewer` skip the construction effect on the server.
- `<VideoView>` renders an empty `<video>` element.

No hydration mismatch warnings expected.

### Cleanup ordering

When a hook unmounts:

1. The `AbortController` aborts.
2. All event listeners detach.
3. The underlying `Publisher` / `Viewer` `.stop()` is called (`void`-ed; the cleanup function is sync).
4. State setters reset to initial values.

For `useUserMedia`, `MediaStreamTrack.stop()` is called on every track in the active stream.

## Pitfalls

- **`useSyncExternalStore` requires React 18+.** No fallback shim.
- **`<VideoView>` autoplay** requires `muted` in modern browsers (Chromium/Safari). If you want unmuted autoplay, ensure a user gesture has occurred first.
- **`VideoSdkProvider.signaling` is a factory, not an instance.** Passing an instance means every hook shares one transport — usually wrong. The signature enforces the factory shape.
- **`opts.stream === null` skips `usePublisher`'s construction.** This is intentional — Publisher needs a stream. Wrap the publisher render in a guard or pass a stream.

## License

MIT — © 2026 Felix Orinda.
