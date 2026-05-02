# @forinda/video-sdk-vue

Vue 3 composables and a `VideoView` component for the Forinda RTC SDK. Idiomatic wrappers around the framework-agnostic `Publisher` / `Viewer` from [`@forinda/video-sdk-core`](https://www.npmjs.com/package/@forinda/video-sdk-core).

## Install

```bash
pnpm add @forinda/video-sdk-vue @forinda/video-sdk-core @forinda/video-sdk-signaling-ws vue
```

> Peer deps: `@forinda/video-sdk-core`, `vue@>=3.4`. Composition API only — Options API is not supported (the reactive boundary doesn't fit). [`@forinda/video-sdk-signaling-ws`](https://www.npmjs.com/package/@forinda/video-sdk-signaling-ws) is the WebSocket transport used in the quick start — swap or omit if you bring your own.

## Quick start

```ts
// main.ts
import { createApp } from "vue";
import { VideoSdkPlugin } from "@forinda/video-sdk-vue";
import { defineWebSocketSignaling } from "@forinda/video-sdk-signaling-ws";
import App from "./App.vue";

createApp(App)
  .use(VideoSdkPlugin, {
    signaling: () => defineWebSocketSignaling({ url: "wss://signal.example.com" }),
    iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
  })
  .mount("#app");
```

```vue
<!-- App.vue -->
<script setup lang="ts">
import { useUserMedia } from "@forinda/video-sdk-vue";
import Broadcast from "./Broadcast.vue";

// Camera resolves asynchronously; mount Broadcast only when stream is ready.
const { stream } = useUserMedia({ audio: true, video: true });
</script>

<template>
  <Broadcast v-if="stream" :stream="stream" />
</template>
```

```vue
<!-- Broadcast.vue -->
<script setup lang="ts">
import { usePublisher, VideoView } from "@forinda/video-sdk-vue";

const props = defineProps<{ stream: MediaStream }>();
const { state, viewers } = usePublisher({ room: "demo", stream: props.stream });
</script>

<template>
  <VideoView :stream="props.stream" muted autoplay playsinline mirror />
  <p>state: {{ state }}, viewers: {{ viewers.length }}</p>
</template>
```

> `usePublisher` reads `stream` once at construction. Mounting via `v-if="stream"` (or attaching to a `Room`) keeps the wiring straightforward — swapping the camera mid-call is done with `replaceVideoTrack(...)`, not by re-rendering the composable.

## Composables

Every composable returns Vue refs. Functions returned alongside (`start`, `stop`, `setAttribute`, …) are stable across re-renders — safe to use as event handlers.

### `useUserMedia(opts)`

Request a `MediaStream`, manage tracks, expose state.

```ts
const { stream, error, state, refresh, stop } = useUserMedia({ audio: true, video: true });
// state: "idle" | "requesting" | "granted" | "denied" | "error"
```

Cleans up tracks on scope dispose. Uses `AbortController` so an in-flight request that finishes after dispose still tears down its stream. SSR-safe (returns inert refs on the server).

### `useDisplayMedia(opts?)`

Request a screen-share `MediaStream` via `getDisplayMedia`. Defaults to **manual start** (most apps want a button click); pass `{ autoStart: true }` to open the picker on creation.

```ts
const { stream, state, start, stop } = useDisplayMedia();
// state: "idle" | "requesting" | "granted" | "denied" | "ended" | "error"

await start(); // opens browser picker
```

The `"ended"` state fires when the user clicks the browser's own "Stop sharing" pill — wire it to swap back to the camera or to tear down a screen-share publisher.

### `useDevices()`

Subscribe to camera/mic/speaker enumeration with hotplug auto-refresh.

```ts
const { cameras, microphones, speakers, refresh } = useDevices();
```

### `usePublisher(opts)`

Construct + manage a `Publisher`. Subscribes to all the events you care about and exposes them as refs.

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
  stream, // a MediaStream (use v-if to defer construction until ready)
  autoStart: true, // default
  stats: { interval: 1000 }, // optional
});
```

If `signaling` / `iceServers` / `retry` aren't supplied, the composable falls back to the `VideoSdkPlugin` config.

### `useViewer(opts)`

Symmetric to `usePublisher`.

```ts
const { viewer, state, stream, stats, error, start, stop } = useViewer({
  room: "demo",
  publisherId: "alice",
});
```

`stream` is `null` until the first `track` event fires; pass it to `<VideoView>`.

### `useConnectionStats(publisherOrViewer, { interval? })`

Standalone composable for consumers managing their own Publisher/Viewer who want stats.

```ts
const stats = useConnectionStats(publisher); // Ref<ConnectionStats[]>
const oneViewer = useConnectionStats(viewer); // Ref<ConnectionStats | null>
```

### `useRoom(opts)`

Construct a `Room` for the calling component's lifetime. The Room owns one signaling transport and one `join`; pair it with `usePublisher({ attach: room })`, `useViewer({ attach: room })`, `useRoomChannel({ attach: room })` to share the transport without the duplicate-join footgun.

```ts
const { room, state, error } = useRoom({ room: "demo", peerId: "alice" });
const { publisher } = usePublisher({ attach: room.value!, stream });
const { channel } = useRoomChannel({ attach: room.value! });
const { messages } = useChat(channel);
```

| Option      | Default               | Description                     |
| ----------- | --------------------- | ------------------------------- |
| `room`      | —                     | Required. Room id.              |
| `peerId`    | `crypto.randomUUID()` | Self id.                        |
| `signaling` | from plugin           | Pre-built `SignalingTransport`. |

When attached, the child composables ignore their own `room` / `peerId` / `signaling` options (taken from the Room).

### `useRoomChannel(opts)`

Construct a `RoomChannel` (presence + chat) for the lifetime of the calling component. Falls back to the plugin's signaling factory when `opts.signaling` is omitted.

```ts
const { channel, state, error } = useRoomChannel({ room: "demo", peerId: "alice" });
// state: "idle" | "connecting" | "connected" | "reconnecting" | "closed"
```

| Option             | Default               | Description                                                                       |
| ------------------ | --------------------- | --------------------------------------------------------------------------------- |
| `room`             | —                     | Required.                                                                         |
| `peerId`           | `crypto.randomUUID()` | Self id.                                                                          |
| `signaling`        | from plugin           | Pre-built `SignalingTransport`.                                                   |
| `manageJoin`       | `true`                | Issue join + leave. Set `false` when sharing a transport with a Publisher/Viewer. |
| `chatHistoryLimit` | `200`                 | Rolling chat-buffer cap.                                                          |
| `autoStart`        | `true`                | Call `channel.start()` on creation.                                               |

### `usePresence(channel)`

Live snapshot of every peer's attributes plus stable write callbacks. Re-fires on `presence`, `presence-snapshot`, and `peer-left` events.

```ts
const { peers, setAttribute, removeAttribute, clearAttributes } = usePresence(channel);
// peers: Ref<Record<peerId, Record<string, JsonValue>>>
await setAttribute("status", "🎬");
```

Accepts a `Ref<RoomChannel | null>`, a getter, or a plain value. Typically the `channel` ref returned by `useRoomChannel` — it'll re-subscribe automatically when the channel finishes constructing.

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

`raised` is a computed ref.

### `useRecorder(stream, opts?)`

Record any `MediaStream` to a `Blob`. Wraps core's `defineRecorder`; constructs the `MediaRecorder` lazily on the first `start()` call and auto-stops on scope dispose.

```ts
const { state, blob, downloadUrl, chunks, error, start, stop, pause, resume } = useRecorder(
  stream,
  {
    mimeType: "video/webm;codecs=vp9,opus",
    videoBitsPerSecond: 2_500_000,
    timesliceMs: 1_000,
    maxBufferedBytes: 200 * 1024 * 1024, // 200 MB cap
  },
);
// state: "idle" | "recording" | "paused" | "stopped" | "error"
//
// downloadUrl: Ref<string | null>
//   Lazy URL.createObjectURL(blob), revoked automatically on next blob /
//   scope dispose. Bind directly to <a download :href="downloadUrl">...
```

When `stream` is `null` (e.g. before `useUserMedia` resolves) the composable returns inert refs and `start()` is a no-op.

## Components

### `<VideoView :stream="..." />`

`<video>` wrapper that handles `srcObject` (which can't go through `<video :src>`) and exposes the underlying element via `defineExpose({ video })`. Optional `mirror` prop applies `transform: scaleX(-1)` for selfie preview.

```vue
<VideoView :stream="stream" muted autoplay playsinline mirror />
```

Forwards every other `<video>` attribute (`controls`, `poster`, `class`, `style`, listeners…). Get a ref to the underlying element via `defineExpose`:

```vue
<script setup lang="ts">
import { ref } from "vue";
import { VideoView } from "@forinda/video-sdk-vue";
const view = ref<{ video: HTMLVideoElement | null } | null>(null);
function fullscreen() {
  view.value?.video?.requestFullscreen();
}
</script>

<template>
  <VideoView ref="view" :stream="stream" />
  <button @click="fullscreen">Fullscreen</button>
</template>
```

## Plugin

### `app.use(VideoSdkPlugin, config)`

Optional — supplies default config to every composable in the tree via Vue's `provide` / `inject`. Per-composable overrides win.

`signaling` is a **factory** (not an instance) so each `usePublisher` / `useViewer` gets its own transport. Multiple components in one tree don't fight over one socket.

```ts
app.use(VideoSdkPlugin, {
  signaling: () => defineWebSocketSignaling({ url: "wss://..." }),
  iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
  retry: { maxAttempts: 5 },
});
```

The plugin is optional — composables that receive `opts.signaling` directly bypass it entirely.

## Behavior

### Reactivity

- All returned values are refs (`Ref<T>`). Read with `.value` in `<script setup>` or directly in templates.
- The composables internally use `shallowRef` for foreign objects (MediaStream, Publisher, Recorder…). Identity comparisons in templates and watchers work as expected.
- Functions returned (`start`, `stop`, `send`, …) are stable — they read live state via captured closures, so calling them after a re-render gets the current value.

### SSR (Nuxt-friendly)

- `useUserMedia`, `useDevices`, and `useDisplayMedia` early-return inert refs on the server (`typeof window === "undefined"`).
- `usePublisher`, `useViewer`, `useRoom`, `useRoomChannel`, and `useRecorder` skip construction on the server.
- `<VideoView>` renders an empty `<video>` element.

No hydration mismatch warnings expected.

### Cleanup ordering

When the active scope disposes (component unmount, manual `effectScope().stop()`):

1. Event listeners detach.
2. The underlying `Publisher` / `Viewer` / `RoomChannel` / `Room` `.stop()` / `.close()` is called (`void`-ed; dispose hooks are sync).
3. Refs reset to initial values.

For `useUserMedia`, `MediaStreamTrack.stop()` is called on every track in the active stream.

## Pitfalls

- **`usePublisher({ stream })` reads `stream` once.** Pass a stream that's already resolved (via `v-if`) or attach to a room. Reactive prop changes are not picked up — that would tear down + rebuild the publisher on every camera change.
- **`<VideoView>` autoplay** requires `muted` in modern browsers (Chromium/Safari). If you want unmuted autoplay, ensure a user gesture has fired first.
- **`VideoSdkPlugin.signaling` is a factory, not an instance.** Passing an instance would mean every component in the tree shares one transport — usually wrong. The signature enforces the factory shape.
- **No Options API.** Composables only work in `setup()` / `<script setup>`.
- **Vue 2 not supported.**

## License

MIT — © 2026 Felix Orinda.
