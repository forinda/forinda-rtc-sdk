# @forinda/video-sdk-react

## 0.1.0

### Minor Changes

Initial public release.

- `<VideoSdkProvider signaling iceServers retry>` — supplies default config to all hooks. `signaling` is a factory.
- `<VideoView stream={...} />` — `<video>` wrapper that handles `srcObject` and forwards refs. Optional `mirror` prop.
- 11 hooks:
  - `useUserMedia({ audio, video })` — request a `MediaStream`, manage tracks, expose state. SSR + StrictMode safe.
  - `useDisplayMedia({ autoStart? })` — screen-share `getDisplayMedia` wrapper with `"ended"` state for the browser's "Stop sharing" pill.
  - `useDevices()` — camera/mic/speaker enumeration with hotplug auto-refresh.
  - `usePublisher({ room, stream })` — construct + manage a `Publisher`; snapshot of `state`, `viewers`, `stats`, `error`.
  - `useViewer({ room, publisherId })` — symmetric viewer hook.
  - `useConnectionStats(publisherOrViewer, { interval? })` — standalone stats subscription.
  - `useRoomChannel({ room, peerId? })` — presence + chat channel with transport `state` passthrough.
  - `usePresence(channel)` — live `peers` map + `setAttribute` / `removeAttribute` / `clearAttributes`.
  - `useChat(channel)` — `messages` + `send(body, { to? })`.
  - `useRaiseHand(channel)` — sugar `{ raised, raise, lower, toggle }`.
  - `useRecorder(stream, opts?)` — record any `MediaStream` to a `Blob`; lazy `downloadUrl` revoked on unmount.

Requires React 18+ (uses `useSyncExternalStore`). Peer dep: `@forinda/video-sdk-core`.
