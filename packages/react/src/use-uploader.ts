/**
 * `useUploader` — wire a `Recorder` to an `Uploader` for the lifetime of
 * the calling component. Returns reactive state for "Uploading…" /
 * "Failed (retry?)" UI.
 *
 * SSR-safe: returns inert state on the server.
 */

import { useCallback, useEffect, useState } from "react";
import {
  pipeRecorderTo,
  type Recorder,
  type Uploader,
  type UploaderState,
} from "@forinda/video-sdk-core";
import { isServer } from "./internal/ssr.ts";

export interface UseUploaderResult {
  state: UploaderState;
  pendingBytes: number;
  error: Error | null;
  /** Resume after a `failed` state. No-op if the uploader is already healthy. */
  retry: () => Promise<void>;
}

export function useUploader(
  recorder: Recorder | null,
  uploader: Uploader | null,
): UseUploaderResult {
  const [state, setState] = useState<UploaderState>(uploader?.state ?? "idle");
  const [pendingBytes, setPendingBytes] = useState<number>(uploader?.pendingBytes ?? 0);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (isServer || recorder === null || uploader === null) return;

    const ctrl = new AbortController();
    const dispose = pipeRecorderTo(recorder, uploader);

    const offState = uploader.on("state", (s) => {
      if (ctrl.signal.aborted) return;
      setState(s);
      setPendingBytes(uploader.pendingBytes);
    });
    const offAck = uploader.on("ack", () => {
      if (ctrl.signal.aborted) return;
      setPendingBytes(uploader.pendingBytes);
    });
    const offError = uploader.on("error", (e) => {
      if (ctrl.signal.aborted) return;
      setError(e);
    });

    return () => {
      ctrl.abort();
      offState();
      offAck();
      offError();
      dispose();
    };
  }, [recorder, uploader]);

  const retry = useCallback(async (): Promise<void> => {
    if (uploader !== null) await uploader.retry();
  }, [uploader]);

  return { state, pendingBytes, error, retry };
}
