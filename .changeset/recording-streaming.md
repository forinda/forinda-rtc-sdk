---
"@forinda/video-sdk-core": minor
"@forinda/video-sdk-elements": minor
"@forinda/video-sdk-react": minor
"@forinda/video-sdk-vue": minor
"@forinda/video-sdk-signaling-protocol": patch
"@forinda/video-sdk-signaling-ws": patch
"@forinda/video-sdk-signaling-broadcast": patch
---

Streaming-upload sink for `Recorder` + declarative element wiring.

### Added

- **`defineUploader({ url, headers?, maxQueuedBytes?, keepaliveThresholdBytes? })`** — HTTP-POST-per-chunk sink for streaming recordings off the device. Uses `fetch` with `keepalive: true` for chunks at or below the threshold (default 60 KB) so chunks survive a page unload, regular `fetch` above. Internal FIFO queue capped at 100 MiB by default.
- **`recorder.pipeTo(uploader)` / `pipeRecorderTo(recorder, uploader)`** — wires `dataavailable` → `uploader.send`. On `failed` → `recorder.pause()`; on recovery via `uploader.retry()` → `recorder.resume()`. Returns a disposer.
- **`<forinda-recorder for="…">`** — looks up `document.getElementById(for).mediaStream` at `start()` time. Lets you wire publisher → recorder declaratively without JS.
- **`<forinda-uploader url="…" headers="…">`** — slottable inside `<forinda-recorder>`. The recorder discovers slotted uploaders at start and pipes each chunk to them. Multiple uploaders allowed.
- **React: `useUploader(recorder, uploader)`** and **Vue: `useUploader(recorder, uploader)`** — adapter helpers exposing `{ state, pendingBytes, error, retry }`.

### Rationale

`defineRecorder` previously buffered every chunk in memory until `stop()`, putting a hard ceiling on recording length. `pipeTo(uploader)` drains chunks as they arrive, with explicit backpressure (`failed` → pause, consumer-driven `retry()` → resume) so a flaky upload server can't silently lose data.
