/**
 * Public surface for `@forinda/video-sdk-react`.
 *
 * Re-exports only — implementation lives in sibling files.
 */

export { VideoSdkProvider, useVideoSdkConfig, type VideoSdkConfig } from "./provider.tsx";

export { useUserMedia, type UseUserMediaResult, type UserMediaState } from "./use-user-media.ts";
export {
  useDisplayMedia,
  type UseDisplayMediaOptions,
  type UseDisplayMediaResult,
  type DisplayMediaState,
} from "./use-display-media.ts";
export { useDevices, type UseDevicesResult } from "./use-devices.ts";
export {
  usePublisher,
  type UsePublisherOptions,
  type UsePublisherResult,
} from "./use-publisher.ts";
export { useViewer, type UseViewerOptions, type UseViewerResult } from "./use-viewer.ts";
export { useConnectionStats, type UseConnectionStatsOptions } from "./use-connection-stats.ts";

export { VideoView, type VideoViewProps } from "./video-view.tsx";
