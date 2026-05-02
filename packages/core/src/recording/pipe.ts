/**
 * `pipeRecorderTo` — wire a `Recorder` into an `Uploader`.
 *
 * Subscribes to `dataavailable` and hands every chunk to `uploader.send`.
 * On `uploader` `failed` → calls `recorder.pause()`. On `uploader` `idle`
 * after recovery → calls `recorder.resume()`. Returns a disposer that
 * unsubscribes both directions; pairs naturally with React's effect
 * cleanup or Vue's `onScopeDispose`.
 */

import type { Recorder } from "./recorder.ts";
import type { Uploader } from "./uploader-types.ts";

export function pipeRecorderTo(recorder: Recorder, uploader: Uploader): () => void {
  const offData = recorder.on("dataavailable", ({ data }) => {
    void uploader.send(data).catch(() => {
      // The uploader's own error event already surfaces this; the
      // recorder.pause below is driven by the state listener.
    });
  });

  const offState = uploader.on("state", (s) => {
    if (s === "failed" && recorder.state === "recording") {
      // Pause so the underlying MediaRecorder doesn't keep producing chunks
      // we can't deliver. Already-buffered chunks survive for retry.
      recorder.pause();
    } else if (s === "idle" && recorder.state === "paused") {
      recorder.resume();
    }
  });

  return () => {
    offData();
    offState();
  };
}
