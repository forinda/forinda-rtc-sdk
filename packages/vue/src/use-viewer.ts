/**
 * `useViewer` — symmetric to `usePublisher` for the viewer side. `stream`
 * is `null` until the first `track` event arrives.
 */

import { onScopeDispose, ref, shallowRef, type Ref } from "vue";
import {
  defineAttachedViewer,
  defineViewer,
  type ConnectionState,
  type ConnectionStats,
  type PcFactory,
  type RetryConfig,
  type Room,
  type SdkError,
  type SignalingTransport,
  type Viewer,
} from "@forinda/video-sdk-core";
import { isServer } from "./internal/ssr.ts";
import { useVideoSdkConfig } from "./plugin.ts";

export interface UseViewerOptions {
  /** Required when `attach` is omitted. */
  room?: string;
  publisherId: string;
  peerId?: string;
  signaling?: SignalingTransport;
  iceServers?: RTCIceServer[];
  stats?: { interval: number };
  retry?: RetryConfig;
  pcFactory?: PcFactory;
  autoStart?: boolean;
  /** Attach to a Room — Room owns transport + the coordinated `join`. */
  attach?: Room;
}

export interface UseViewerResult {
  viewer: Ref<Viewer | null>;
  state: Ref<ConnectionState>;
  stream: Ref<MediaStream | null>;
  stats: Ref<ConnectionStats | null>;
  error: Ref<SdkError | null>;
  start: () => Promise<void>;
  stop: () => Promise<void>;
}

export function useViewer(opts: UseViewerOptions): UseViewerResult {
  const config = useVideoSdkConfig();
  const viewer = shallowRef<Viewer | null>(null);
  const state = ref<ConnectionState>("idle");
  const stream = shallowRef<MediaStream | null>(null);
  const stats = shallowRef<ConnectionStats | null>(null);
  const error = shallowRef<SdkError | null>(null);

  const autoStart = opts.autoStart ?? true;

  if (!isServer) {
    let v: Viewer;
    if (opts.attach) {
      v = defineAttachedViewer(opts.attach, {
        publisherId: opts.publisherId,
        ...((opts.iceServers ?? config.iceServers) !== undefined
          ? { iceServers: (opts.iceServers ?? config.iceServers) as RTCIceServer[] }
          : {}),
        ...(opts.stats !== undefined ? { stats: opts.stats } : {}),
        ...((opts.retry ?? config.retry) !== undefined
          ? { retry: (opts.retry ?? config.retry) as RetryConfig }
          : {}),
        ...(opts.pcFactory !== undefined ? { pcFactory: opts.pcFactory } : {}),
      });
    } else {
      const signaling = opts.signaling ?? config.signaling?.();
      if (signaling === undefined) {
        error.value = {
          name: "ConfigurationError",
          message:
            "useViewer: no signaling transport (provide opts.signaling, opts.attach, or VideoSdkPlugin)",
          code: "configuration_error",
          retryable: false,
        } as SdkError;
        return buildResult();
      }
      if (opts.room === undefined) {
        error.value = {
          name: "ConfigurationError",
          message: "useViewer: opts.room is required when not attaching to a Room",
          code: "configuration_error",
          retryable: false,
        } as SdkError;
        return buildResult();
      }
      v = defineViewer({
        signaling,
        room: opts.room,
        publisherId: opts.publisherId,
        ...(opts.peerId !== undefined ? { peerId: opts.peerId } : {}),
        ...((opts.iceServers ?? config.iceServers) !== undefined
          ? { iceServers: (opts.iceServers ?? config.iceServers) as RTCIceServer[] }
          : {}),
        ...(opts.stats !== undefined ? { stats: opts.stats } : {}),
        ...((opts.retry ?? config.retry) !== undefined
          ? { retry: (opts.retry ?? config.retry) as RetryConfig }
          : {}),
        ...(opts.pcFactory !== undefined ? { pcFactory: opts.pcFactory } : {}),
      });
    }

    viewer.value = v;

    const offState = v.on("state", (s) => {
      state.value = s;
    });
    const offTrack = v.on("track", ({ stream: s }) => {
      stream.value = s;
    });
    const offStats = v.on("stats", (s) => {
      stats.value = s;
    });
    const offError = v.on("error", (e) => {
      error.value = e;
    });

    if (autoStart) {
      void v.start();
    }

    onScopeDispose(() => {
      offState();
      offTrack();
      offStats();
      offError();
      void v.stop();
      viewer.value = null;
      state.value = "idle";
      stream.value = null;
      stats.value = null;
    });
  }

  function buildResult(): UseViewerResult {
    return {
      viewer,
      state,
      stream,
      stats,
      error,
      start: async () => {
        if (viewer.value) await viewer.value.start();
      },
      stop: async () => {
        if (viewer.value) await viewer.value.stop();
      },
    };
  }

  return buildResult();
}
