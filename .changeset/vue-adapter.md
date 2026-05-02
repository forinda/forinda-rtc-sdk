---
"@forinda/video-sdk-vue": minor
---

New package: Vue 3 adapter.

Vue 3.4+ peer dep, Composition API only. Twelve composables that mirror the React surface name-for-name — `useUserMedia`, `useDisplayMedia`, `useDevices`, `usePublisher`, `useViewer`, `useConnectionStats`, `useRoom`, `useRoomChannel`, `usePresence`, `useChat`, `useRaiseHand`, `useRecorder` — plus a `VideoView` component that handles `srcObject` and exposes the underlying `<video>` via `defineExpose`.

```ts
// main.ts
import { createApp } from "vue";
import { VideoSdkPlugin } from "@forinda/video-sdk-vue";
import { defineWebSocketSignaling } from "@forinda/video-sdk-signaling-ws";

createApp(App)
  .use(VideoSdkPlugin, {
    signaling: () => defineWebSocketSignaling({ url: "wss://signal.example.com" }),
    iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
  })
  .mount("#app");
```

```vue
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

- Reactive state via `ref` / `shallowRef` (foreign objects use `shallowRef` to preserve identity).
- Cleanup via `onScopeDispose` — auto-stops publishers/viewers/recorders, releases tracks, revokes object URLs.
- SSR-safe (Nuxt-friendly): inert refs on the server; no hydration mismatch.
- Same `attach: room` pattern as React for sharing one transport between Publisher / Viewer / RoomChannel.
- Bundle: 10.8 KB ESM minified, externalises `vue` and `@forinda/video-sdk-core`.
