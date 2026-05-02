/**
 * Manual-registration entrypoint for `@forinda/video-sdk-elements`.
 *
 * Re-exports the same classes as the side-effecting `index.ts` but does NOT
 * call `registerAll()`. Import this when you need to defer registration, swap
 * tag names, or only register a subset.
 *
 * @example
 * ```ts
 * import { ForindaVideoPublisher } from "@forinda/video-sdk-elements/manual";
 *
 * customElements.define("my-publisher", ForindaVideoPublisher);
 * ```
 */

export {
  ForindaVideoPublisher,
  type PublisherElementOverrides,
} from "./elements/video-publisher.ts";
export { ForindaVideoViewer, type ViewerElementOverrides } from "./elements/video-viewer.ts";
export {
  ForindaVideoDevicePicker,
  type DeviceKind,
  type DevicePickerOverrides,
} from "./elements/video-device-picker.ts";
export { ForindaRecorder } from "./elements/recorder.ts";
export { registerAll } from "./elements/register.ts";
