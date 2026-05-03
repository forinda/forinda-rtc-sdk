# Troubleshooting

Every typed error in the SDK carries a stable `code` string. Match against the code, not the message — messages may evolve, codes won't.

```ts
import { SdkError } from "@forinda/video-sdk-core";

try {
  await publisher.start();
} catch (e) {
  if (e instanceof SdkError && e.code === "permission_denied") {
    showCameraPermissionUI();
  } else {
    throw e;
  }
}
```

## Browser-side errors (`@forinda/video-sdk-core`)

All extend `SdkError`.

| `code`                     | Symptom                                                                              | Likely cause                                                                                                         | Fix                                                                                                                                   |
| -------------------------- | ------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `permission_denied`        | `getUserMedia` / `getDisplayMedia` rejects; `useUserMedia` state goes to `"denied"`. | User clicked "Block" on the permission prompt.                                                                       | Surface a "permissions blocked" UI; link to browser settings. The hook stays at `denied` — call `refresh()` after the user re-grants. |
| `device_not_found`         | No camera / mic available.                                                           | The device list is empty (laptop with the lid closed, headless server, etc.).                                        | Use `useDevices()` to enumerate; gate the publish UI on there being at least one matching device.                                     |
| `device_in_use`            | `getUserMedia` rejects with `NotReadableError`.                                      | Another tab / app holds the camera (Zoom, Teams).                                                                    | This is a `retryable: true` error — call `refresh()` once the conflict clears.                                                        |
| `overconstrained`          | Constraints can't be satisfied.                                                      | Asked for 4K on a 720p webcam, or a deviceId that no longer exists.                                                  | Loosen the constraints (drop `width`/`height`, fall back to `deviceId: undefined`).                                                   |
| `media_error`              | Generic media-acquisition failure that doesn't fit the above.                        | Browser-specific weirdness (typically Safari).                                                                       | Log + retry; if it persists, fall back to `useDisplayMedia` or audio-only.                                                            |
| `display_capture_error`    | Screen-share `getDisplayMedia` failed.                                               | Mostly user-cancelled the picker; iOS doesn't support it; rare browser-specific failures.                            | Treat user-cancel as expected; for iOS, hide the screen-share UI.                                                                     |
| `ice_failed`               | Publisher / Viewer state goes to `"failed"`.                                         | ICE candidate gathering / connectivity check timed out — usually a NAT or firewall problem.                          | Add TURN to `iceServers`. The retry policy will reconnect; if it exhausts, bigger-hammer fixes are needed (e.g. `relay` policy).      |
| `dtls_failed`              | Connection state went to `"failed"` after ICE succeeded.                             | DTLS handshake failure (extremely rare; usually a clock-skew issue or middlebox munging packets).                    | Out of the SDK's hands — check system clock + drop any unusual proxies.                                                               |
| `negotiation_error`        | SDP offer/answer exchange threw.                                                     | Mismatched codecs, malformed SDP from a custom adapter, or a regression in the perfect-negotiation glare resolution. | Check `cause` for the underlying RTCError. If reproducible, file an issue with the SDP.                                               |
| `pc_failed`                | `RTCPeerConnection.connectionState === "failed"`.                                    | The PC gave up after retries (ICE down, peer left).                                                                  | The retry policy handles this; if it exhausts, see `retry_exhausted` below.                                                           |
| `signaling_closed`         | Publisher / Viewer / RoomChannel emits `error` then enters `reconnecting`.           | The signaling WebSocket dropped unexpectedly.                                                                        | The component's `retry` config drives the reconnect. Tune `maxAttempts` / `maxDurationMs` for your tolerance.                         |
| `reconnect_failed`         | One reconnect attempt failed (transient — internal).                                 | Server still down at retry time.                                                                                     | No action — the retry policy will try again until exhausted.                                                                          |
| `retry_exhausted`          | Component transitions to `"closed"` with this error.                                 | The retry budget ran out (default 5 attempts over 5 minutes).                                                        | UI should surface a "lost connection" message; user reload OR a fresh `start()` to begin a new budget.                                |
| `not_connected`            | `Recorder` / publisher API called before transport was connected.                    | Programming bug — calling something that requires a live socket too early.                                           | Await `ensureConnected()` (or the relevant lifecycle event) first.                                                                    |
| `configuration_error`      | Constructor / option-validation failure.                                             | Missing required option, conflicting roles on one Room, etc.                                                         | Check the message — these are programming errors, not runtime conditions.                                                             |
| `recorder_start_failed`    | `Recorder.start()` threw.                                                            | `MediaRecorder` constructor rejected (codec mismatch or stream tracks went away).                                    | Check codec preferences; try `pickRecordingType` first to confirm browser support.                                                    |
| `recorder_runtime_error`   | `Recorder` emitted `error` mid-recording.                                            | Underlying `MediaRecorder` errored.                                                                                  | Surface as a "recording stopped" UI; the assembled `Blob` (if any) is still available.                                                |
| `recorder_buffer_overflow` | Recorder stops with this code.                                                       | `maxBufferedBytes` exceeded — the consumer didn't drain via `pipeTo` or `dataavailable`.                             | Either raise the cap OR pipe to an uploader to drain chunks as they arrive.                                                           |
| `uploader_closed`          | `uploader.send()` rejects.                                                           | Called after `uploader.close()`.                                                                                     | Construct a fresh uploader; closed uploaders don't accept new chunks.                                                                 |
| `uploader_queue_overflow`  | `uploader.send()` rejects mid-recording.                                             | Backend can't keep up; the FIFO hit `maxQueuedBytes`.                                                                | The pipe pauses the recorder automatically. Investigate backend latency or raise the cap.                                             |
| `uploader_http_error`      | Uploader transitions to `"failed"`.                                                  | Server returned 4xx / 5xx.                                                                                           | Check server logs; call `uploader.retry()` once the issue is resolved.                                                                |
| `uploader_send_failed`     | `uploader.send()` rejected with a non-HTTP error.                                    | Network blip, fetch threw before the response.                                                                       | Same as above — `uploader.retry()` after the cause clears.                                                                            |

## Wire-format errors (`@forinda/video-sdk-signaling-protocol`)

These come from the server-side engine and (usually) propagate to the client as a `recorder-error` / publisher `error` event with the `code` preserved.

| `code`                 | Symptom                                                                         | Likely cause                                                               | Fix                                                                                                                                 |
| ---------------------- | ------------------------------------------------------------------------------- | -------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `signaling_validation` | The engine rejects an inbound message; client sees a transport-level error.     | Malformed JSON, missing fields, or a message type the server doesn't know. | Make sure the client is on the same major version of `signaling-protocol` as the server.                                            |
| `signaling_auth`       | `join` rejected.                                                                | The engine's `authenticate(token, room)` callback returned `false`.        | Check the token at the client; check the auth function on the server.                                                               |
| `room_full`            | `join` rejected.                                                                | Room is already at `maxPeersPerRoom`.                                      | Raise the cap (`defineSignalingEngine({ maxPeersPerRoom: N })`) or surface "room full" in the UI.                                   |
| `peer_not_found`       | SDP / ICE relay fails.                                                          | The target peerId disconnected (or never joined) before the relay arrived. | Usually benign — the publisher should clean up the dead viewer; check that `defineRoom` is being used so peer cleanup is automatic. |
| `rate_limited`         | `chat` or `presence-update` rejected.                                           | The peer's per-type token bucket is empty.                                 | Throttle the client; or raise `chatPerSec` / `presenceUpdatesPerSec` on the engine.                                                 |
| `director_conflict`    | `join` with `role: "director"` rejected.                                        | The room already has a director — first-claim wins.                        | Use `promote` from the existing director to add a co-director.                                                                      |
| `not_authorized`       | A moderation command (`mute`/`kick`/`promote`/etc.) was rejected by the engine. | `enforceModerationCommands: true` is on AND the sender isn't a director.   | Either (a) the sender shouldn't be sending moderation commands, or (b) promote them first via the existing director.                |

## When the error doesn't surface

Some failures are honor-mode by design — the engine relays the message and trusts the target client to obey. If you expect the engine to enforce something, double-check:

- **Moderation commands** (mute / kick / set-bitrate) only enforce when `defineSignalingEngine({ enforceModerationCommands: true })`. Default off.
- **Chat history replay** only fires when both the engine has `chatHistoryPerRoom > 0` AND the joining client sets `replayHistory: true` on its `join`.
- **Rate limits** only apply to fields that have a positive cap. `rateLimit: { chatPerSec: 0 }` does NOT mean "no chat allowed" — it means "no limit." Use `undefined` or omit the field to disable a limiter.

## Diagnostics checklist

When the symptom is "it doesn't work" with no specific error:

1. **Open the browser devtools network panel.** Filter on `WS` — there should be exactly one signaling socket per `Room`. If there are more than one with the same room id, you're probably constructing a transport per child instead of using `defineRoom`.
2. **Check `chrome://webrtc-internals`** (Chromium) or `about:webrtc` (Firefox). The PC connection state, ICE state, and SDP transcripts are all there. `ice_failed` almost always shows up here as `iceConnectionState: failed` — usually a missing TURN server.
3. **Run the integration tests against your custom server** — `pnpm test:integration` will catch most wire-format incompatibilities. If you've forked the protocol, add a fixture there.
4. **Bump the log level.** `setLogger({ level: "debug" })` from `@forinda/video-sdk-core` enables internal trace logs without code changes.
