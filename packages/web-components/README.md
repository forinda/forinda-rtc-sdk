# @forinda/video-sdk-elements

Framework-agnostic Web Components (custom HTML elements) for the Forinda RTC SDK. Use them directly in plain HTML, or inside any framework that renders DOM (Vue, Svelte, Angular, Solid, plain Lit, etc.).

## Install

```bash
pnpm add @forinda/video-sdk-elements @forinda/video-sdk-core @forinda/video-sdk-signaling-ws
```

> Peer deps: `@forinda/video-sdk-core`, `@forinda/video-sdk-signaling-ws`. Both ship as workspace siblings — no transitive bundling.

## Quick start

```html
<script type="module">
  import "@forinda/video-sdk-elements";
</script>

<forinda-video-publisher
  room="demo"
  signaling-url="wss://signal.example.com"
  ice-servers='[{"urls":"stun:stun.l.google.com:19302"}]'
  audio
  video
  mirror
></forinda-video-publisher>
```

Importing `@forinda/video-sdk-elements` registers all elements automatically (idempotent — safe across multiple bundles). For manual control, use the `/manual` subpath:

```ts
import { ForindaVideoPublisher, registerAll } from "@forinda/video-sdk-elements/manual";

// Define under your own tag name…
customElements.define("my-publisher", ForindaVideoPublisher);

// …or call the bundled registrar later.
registerAll();
```

## Elements

### `<forinda-video-publisher>`

Acquires `getUserMedia`, opens a WebSocket signaling channel, and publishes one-to-many until removed from the DOM.

**Attributes:**

| Attribute       | Type    | Default  | Description                                                                                   |
| --------------- | ------- | -------- | --------------------------------------------------------------------------------------------- |
| `room`          | string  | —        | Required. Room id this publisher joins.                                                       |
| `signaling-url` | string  | —        | Required. WebSocket signaling URL.                                                            |
| `peer-id`       | string  | uuid     | Optional self-identifier for the publisher.                                                   |
| `source`        | enum    | `camera` | `camera` (uses `getUserMedia`) or `screen` (uses `getDisplayMedia`).                          |
| `audio`         | boolean | implied  | Capture audio. Implied if neither `audio` nor `video`. Camera only.                           |
| `video`         | boolean | implied  | Capture video. Implied if neither `audio` nor `video`. Camera only.                           |
| `share-audio`   | boolean | `false`  | When `source="screen"`, request system audio (browsers usually require explicit user opt-in). |
| `ice-servers`   | JSON    | `[]`     | `RTCIceServer[]` literal.                                                                     |
| `mirror`        | boolean | `false`  | Apply `transform: scaleX(-1)` to the local preview.                                           |
| `manual-play`   | boolean | `false`  | Skip the default `muted/autoplay/playsInline` setup.                                          |

**Events** (all `CustomEvent`, do not bubble):

| Event         | `event.detail`                                     |
| ------------- | -------------------------------------------------- |
| `ready`       | `{ stream: MediaStream; publisher: Publisher }`    |
| `state`       | `ConnectionState` from the publisher state machine |
| `viewer`      | `{ peerId: string }` — viewer joined               |
| `viewer-left` | `{ peerId: string }`                               |
| `error`       | `Error`                                            |

**Styling:** the internal `<video>` is exposed via the `video` shadow part:

```css
forinda-video-publisher::part(video) {
  border-radius: 12px;
  aspect-ratio: 16 / 9;
}
```

**Screen sharing:**

```html
<forinda-video-publisher
  room="demo"
  signaling-url="wss://signal.example.com"
  source="screen"
  share-audio
></forinda-video-publisher>
```

Mount a _second_ publisher element to share screen alongside camera — each gets its own `peerId`, so viewers subscribe to whichever they want.

### `<forinda-video-viewer>`

Subscribes to a publisher and renders the inbound stream.

**Attributes:**

| Attribute       | Type    | Default | Description                                      |
| --------------- | ------- | ------- | ------------------------------------------------ |
| `room`          | string  | —       | Required.                                        |
| `publisher-id`  | string  | —       | Required. The publisher peer id to subscribe to. |
| `signaling-url` | string  | —       | Required.                                        |
| `peer-id`       | string  | uuid    | Optional self-identifier for the viewer.         |
| `ice-servers`   | JSON    | `[]`    | `RTCIceServer[]` literal.                        |
| `manual-play`   | boolean | `false` | Skip default playback setup.                     |

**Events:**

| Event   | `event.detail`                            |
| ------- | ----------------------------------------- |
| `ready` | `{ viewer: Viewer }`                      |
| `state` | `ConnectionState`                         |
| `track` | `{ stream: MediaStream }` (first inbound) |
| `error` | `Error`                                   |

The inbound `<video>` is exposed via `::part(video)`. The element sets `srcObject` on the first `track` event and exposes the live stream via the `mediaStream` JS property.

### `<forinda-recorder>`

Record any `MediaStream` to a `Blob`. The stream is set as a JS property (not an attribute — `MediaStream` isn't serializable). Codec / bitrate / chunking are attributes; lifecycle is exposed both as the toolbar button (in shadow DOM) and as imperative methods.

**Attributes:**

| Attribute      | Type    | Default                        | Description                                                |
| -------------- | ------- | ------------------------------ | ---------------------------------------------------------- |
| `mime-type`    | string  | first supported VP9/VP8 / WebM | Pin a specific recorder mime type.                         |
| `video-bps`    | number  | browser default                | Target video bitrate in bits per second.                   |
| `audio-bps`    | number  | browser default                | Target audio bitrate in bits per second.                   |
| `timeslice-ms` | number  | one chunk on stop              | Emit `dataavailable` every N ms instead of only on stop.   |
| `auto-start`   | boolean | `false`                        | Start recording immediately when `stream` property is set. |

**JS properties / methods:**

| Member                 | Purpose                                                     |
| ---------------------- | ----------------------------------------------------------- |
| `stream`               | Set / get the `MediaStream` to record.                      |
| `start()` / `stop()`   | Imperative lifecycle. `stop()` resolves with the `Blob`.    |
| `pause()` / `resume()` | Pause and resume the active recording.                      |
| `recorderInstance`     | Read-only access to the underlying `Recorder` once started. |

**Events:**

| Event            | `event.detail`                                                                                                                      |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `recorder-start` | `{ mimeType: string }`                                                                                                              |
| `recorder-stop`  | `{ blob: Blob; mimeType: string; durationMs: number; url: string }` (`url` is `URL.createObjectURL(blob)` for download convenience) |
| `recorder-error` | `Error`                                                                                                                             |

**Styling:** the toolbar button + status span are exposed as `::part(button)` / `::part(status)` for theming.

```html
<forinda-recorder
  mime-type="video/webm;codecs=vp9,opus"
  video-bps="2500000"
  timeslice-ms="1000"
></forinda-recorder>
<script type="module">
  const el = document.querySelector("forinda-recorder");
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
  el.stream = stream;
  el.addEventListener("recorder-stop", (e) => {
    const a = document.createElement("a");
    a.href = e.detail.url;
    a.download = "clip.webm";
    a.click();
  });
</script>
```

> **iOS / Safari:** `MediaRecorder` is unreliable pre-iOS-17. The element will fire `recorder-error` with a `ConfigurationError` if no codec is supported.

#### Streaming uploads (declarative)

Pair `<forinda-recorder>` with `<forinda-uploader>` for one-line streaming uploads. The recorder element discovers slotted uploaders at `start()` and pipes every chunk to each.

```html
<forinda-video-publisher id="cam" ws="wss://signal.example.com"></forinda-video-publisher>
<forinda-recorder for="cam" timeslice-ms="1000">
  <forinda-uploader
    url="/api/uploads"
    headers='{"Authorization":"Bearer t"}'
    max-queued-bytes="200000000"
  ></forinda-uploader>
</forinda-recorder>
```

- `for="cam"` reads the target's `mediaStream` property at `start()` time. Stream changes (e.g. swapping screen-share back to camera) are not auto-followed — call `el.stop()` then `el.start()` to pick up a new stream.
- Multiple `<forinda-uploader>` children are allowed; each gets its own pipe (useful for fan-out to redundant backends).
- An uploader entering `"failed"` state pauses the recorder automatically. Call `el.querySelector("forinda-uploader").uploader.retry()` to recover.

### `<forinda-uploader>`

Declarative companion to `<forinda-recorder>`. Lazily builds a `defineUploader` from its attributes; the recorder pipes chunks to it via the slot mechanism above. Can also be used standalone — read `el.uploader` and call `.send(blob)` directly.

**Attributes:**

| Attribute             | Default             | Purpose                                                                                                |
| --------------------- | ------------------- | ------------------------------------------------------------------------------------------------------ |
| `url`                 | —                   | Required for `.uploader` to build. POST destination.                                                   |
| `headers`             | `{}`                | JSON object of extra request headers. Malformed JSON falls back to no headers (with a `console.warn`). |
| `max-queued-bytes`    | `100 * 1024 * 1024` | Cap on bytes queued; over-cap `send` rejects.                                                          |
| `keepalive-threshold` | `60_000`            | Chunks at or below this size use `fetch` with `keepalive: true`.                                       |

### `<forinda-video-device-picker>`

A `<select>` populated with the user's cameras / microphones / speakers, kept in sync via `devicechange`.

**Attributes:**

| Attribute     | Type   | Default           | Description                               |
| ------------- | ------ | ----------------- | ----------------------------------------- |
| `kind`        | enum   | `camera`          | One of `camera`, `microphone`, `speaker`. |
| `placeholder` | string | `Select a device` | Disabled first option label.              |

**Events:**

| Event    | `event.detail`                        |
| -------- | ------------------------------------- |
| `change` | `{ deviceId: string; label: string }` |
| `error`  | `Error`                               |

The internal `<select>` is exposed via `::part(select)`.

```html
<forinda-video-device-picker
  kind="camera"
  placeholder="Choose camera"
></forinda-video-device-picker>
<script type="module">
  document
    .querySelector("forinda-video-device-picker")
    .addEventListener("change", (e) => console.log("picked", e.detail.deviceId));
</script>
```

> Device labels are empty until at least one capture permission has been granted. Show a publisher (or call `getUserMedia` directly) before relying on labels.

## Test injection

Each element exposes an `overrides` JS property so you can swap factories without monkey-patching globals. Set it BEFORE the element is appended:

```ts
const el = document.createElement("forinda-video-publisher");
el.overrides = {
  getUserMedia: (c) => fakeStream(c),
  signalingFactory: () => fakeSignaling(),
  publisherFactory: () => fakePublisher(),
};
el.setAttribute("room", "demo");
el.setAttribute("signaling-url", "wss://x");
document.body.appendChild(el);
```

These hooks are intended for tests and storybook stubs — production code should leave `overrides` empty.

## Behavior

### Lifecycle

- `connectedCallback` aborts any pending start, opens a fresh `AbortController`, and runs the start sequence: `getUserMedia` → signaling factory → core orchestrator → `start()`.
- `disconnectedCallback` aborts, detaches all listeners, calls `.stop()` on the orchestrator, `.disconnect()` on the signaling transport, and stops every track in the local stream.
- Re-attaching the element (move via `appendChild`) starts a fresh session.

### SSR

Importing `@forinda/video-sdk-elements` on the server is safe — `customElements` is feature-detected. The elements still construct (no DOM access until `connectedCallback`), so a build that loads but never renders is fine.

### Shipping format

- **ESM** (`./dist/index.js`) — the default for bundlers and browsers via `<script type="module">`.
- **IIFE** (`./dist/index.global.js`, exposed as `ForindaVideoSdk`) — drop-in `<script src=…>` for no-build pages. Imports `@forinda/video-sdk-core` and `@forinda/video-sdk-signaling-ws` as `external`s, so include them first.

## Pitfalls

- **`signaling-url` must be a WebSocket URL.** Non-WS URLs will throw inside the signaling factory and surface as an `error` event.
- **`ice-servers` is parsed as JSON.** Use single quotes around the attribute value to avoid escaping double quotes inside.
- **Autoplay needs `muted`.** The element sets both by default. If you opt into `manual-play`, you must call `.play()` yourself after a user gesture.
- **`overrides` must be set before connect.** Setting it after `connectedCallback` has already kicked off the start sequence is a no-op for that run.

## License

MIT — © 2026 Felix Orinda.
