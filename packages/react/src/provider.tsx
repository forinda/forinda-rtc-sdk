/**
 * `VideoSdkProvider` — optional context that supplies default `signaling`
 * factory + `iceServers` + `retry` to the SDK hooks. Hooks accept per-call
 * overrides; the provider just spares you from repeating common config.
 *
 * `signaling` is a **factory** (not an instance) so each hook gets its own
 * transport — multiple Publisher/Viewer hooks in one tree don't fight over
 * one socket.
 */

import { createContext, useContext, useMemo, type PropsWithChildren, type JSX } from "react";
import type { RetryConfig, SignalingTransport } from "@forinda/video-sdk-core";

export interface VideoSdkConfig {
  signaling?: () => SignalingTransport;
  iceServers?: RTCIceServer[];
  retry?: RetryConfig;
}

const Ctx = createContext<VideoSdkConfig>({});

/** Wrap your app once with config that the SDK hooks pick up by default. */
export function VideoSdkProvider({
  children,
  signaling,
  iceServers,
  retry,
}: PropsWithChildren<VideoSdkConfig>): JSX.Element {
  const value = useMemo<VideoSdkConfig>(
    () => ({
      ...(signaling !== undefined ? { signaling } : {}),
      ...(iceServers !== undefined ? { iceServers } : {}),
      ...(retry !== undefined ? { retry } : {}),
    }),
    [signaling, iceServers, retry],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** Read the current SDK config (or `{}` when no provider is mounted). */
export function useVideoSdkConfig(): VideoSdkConfig {
  return useContext(Ctx);
}
