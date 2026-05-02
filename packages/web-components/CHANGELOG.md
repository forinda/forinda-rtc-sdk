# @forinda/video-sdk-elements

## 0.1.1

### Patch Changes

- Updated dependencies [[`0c25d10`](https://github.com/forinda/forinda-rtc-sdk/commit/0c25d108fecb8266696c633904cb4b303a9a4179)]:
  - @forinda/video-sdk-core@0.1.1
  - @forinda/video-sdk-signaling-ws@0.1.1

## 0.1.0

### Minor Changes

Initial public release.

- 4 custom HTML elements, all with shadow DOM + `::part()` styling:
  - `<forinda-video-publisher>` — `getUserMedia` (or `getDisplayMedia` via `source="screen"`) + `Publisher` lifecycle. Attributes: `room`, `signaling-url`, `peer-id`, `source`, `audio`, `video`, `share-audio`, `ice-servers`, `mirror`, `manual-play`. Events: `ready`, `state`, `viewer`, `viewer-left`, `error`.
  - `<forinda-video-viewer>` — symmetric receiver.
  - `<forinda-video-device-picker kind="camera|microphone|speaker">` — live device enumeration as a styled `<select>`.
  - `<forinda-recorder>` — `MediaRecorder` wrapper with built-in toolbar button + status. Auto-creates a `URL.createObjectURL(blob)` on stop for one-line downloads. Attributes: `mime-type`, `video-bps`, `audio-bps`, `timeslice-ms`, `auto-start`. Events: `recorder-start`, `recorder-stop`, `recorder-error`.
- Auto-registers all elements when imported as `@forinda/video-sdk-elements`. Use `/manual` for opt-in registration with custom tag names.
- ESM + IIFE builds. IIFE exposes `window.ForindaVideoSdk` for `<script>` drop-in.

Peer deps: `@forinda/video-sdk-core`, `@forinda/video-sdk-signaling-ws`.
