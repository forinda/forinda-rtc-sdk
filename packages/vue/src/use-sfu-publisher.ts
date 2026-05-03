/**
 * `useSfuPublisher` — Vue composable mirroring the React hook. SFU
 * media; SSR-safe; cleans up on `onScopeDispose`.
 */

import { onScopeDispose, ref, shallowRef, type Ref } from "vue";
import {
  defineSfuPublisher,
  type SfuConnectionState,
  type SfuPublisher,
  type SfuPublisherOptions,
} from "@forinda/video-sdk-sfu-livekit";
import type { SdkError } from "@forinda/video-sdk-core";
import { isServer } from "./internal/ssr.ts";

export interface UseSfuPublisherOptions extends Omit<SfuPublisherOptions, "stream"> {
  stream: MediaStream | null;
  autoStart?: boolean;
}

export interface UseSfuPublisherResult {
  publisher: Ref<SfuPublisher | null>;
  state: Ref<SfuConnectionState>;
  viewers: Ref<readonly string[]>;
  error: Ref<SdkError | null>;
  start: () => Promise<void>;
  stop: () => Promise<void>;
  replaceVideoTrack: (track: MediaStreamTrack) => Promise<void>;
  replaceAudioTrack: (track: MediaStreamTrack) => Promise<void>;
}

export function useSfuPublisher(opts: UseSfuPublisherOptions): UseSfuPublisherResult {
  const publisher = shallowRef<SfuPublisher | null>(null);
  const state = ref<SfuConnectionState>("idle");
  const viewers = shallowRef<readonly string[]>([]);
  const error = shallowRef<SdkError | null>(null);

  const autoStart = opts.autoStart ?? true;

  if (!isServer && opts.stream !== null) {
    const p = defineSfuPublisher({
      url: opts.url,
      token: opts.token,
      room: opts.room,
      peerId: opts.peerId,
      stream: opts.stream,
      ...(opts.retry !== undefined ? { retry: opts.retry } : {}),
      ...(opts.stats !== undefined ? { stats: opts.stats } : {}),
    });
    publisher.value = p;

    const offState = p.on("state", (s) => {
      state.value = s;
    });
    const offJoin = p.on("viewer-joined", () => {
      viewers.value = [...p.peers()];
    });
    const offLeave = p.on("viewer-left", () => {
      viewers.value = [...p.peers()];
    });
    const offError = p.on("error", (e) => {
      error.value = e;
    });

    if (autoStart) void p.start();

    onScopeDispose(() => {
      offState();
      offJoin();
      offLeave();
      offError();
      void p.stop();
      publisher.value = null;
    });
  }

  return {
    publisher,
    state,
    viewers,
    error,
    start: async () => {
      if (publisher.value) await publisher.value.start();
    },
    stop: async () => {
      if (publisher.value) await publisher.value.stop();
    },
    replaceVideoTrack: async (track) => {
      if (publisher.value) await publisher.value.replaceVideoTrack(track);
    },
    replaceAudioTrack: async (track) => {
      if (publisher.value) await publisher.value.replaceAudioTrack(track);
    },
  };
}
