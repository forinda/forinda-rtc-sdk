# Pick your stack

Two questions decide what to install.

## 1. Which framework?

| You're writing…                               | Use this adapter                                       | Page                           |
| --------------------------------------------- | ------------------------------------------------------ | ------------------------------ |
| Plain TypeScript / Vite / no framework        | `@forinda/video-sdk-core` directly                     | [core](/packages/core)         |
| React 18+                                     | `@forinda/video-sdk-react` (hooks + `<VideoView>`)     | [react](/packages/react)       |
| Vue 3.4+                                      | `@forinda/video-sdk-vue` (composables + `<VideoView>`) | [vue](/packages/vue)           |
| Web Components / Lit / Stencil / no framework | `@forinda/video-sdk-elements` (4 custom elements)      | [elements](/packages/elements) |

The framework adapters are thin wrappers around `@forinda/video-sdk-core` — same lifecycle, same events, just expressed in your framework's idiom.

## 2. Mesh or SFU?

| Scale / shape                                 | Use                                                                     |
| --------------------------------------------- | ----------------------------------------------------------------------- |
| 1-on-1 / small group (≤ 6–8 peers, full mesh) | Mesh — `definePublisher` + `defineViewer`. Default.                     |
| 1-publisher webinar (1 → N viewers, N > ~8)   | SFU — `defineSfuPublisher` + `defineSfuViewer` via the LiveKit adapter. |
| Town-hall (2-3 publishers, many viewers)      | SFU. Same reason.                                                       |
| Recording at scale, server-side composited    | LiveKit egress directly (out of scope for the SDK).                     |

The SFU adapter has the same `Publisher` / `Viewer` shape as mesh, so swapping is one factory call. See [SFU integration](/cookbook/sfu-integration) for the full mesh→SFU migration.

## Then add what you need

- **Chat / presence / raise-hand** — `defineRoomChannel` (or `room.channel()` if you're using `defineRoom`). Rides the same WebSocket as media. See [Patterns](/cookbook/patterns).
- **Recording** — `defineRecorder(stream, { timesliceMs: 1000 })`. Ships chunks to your uploader.
- **Screen share** — `getDisplayMedia()` then feed it to a second `Publisher` with a different room name (or replace the camera track on the existing one).
