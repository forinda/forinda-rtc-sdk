/**
 * Public surface for `@forinda/video-sdk-elements`.
 *
 * Side-effecting entrypoint: importing this module registers
 * `<forinda-video-publisher>`, `<forinda-video-viewer>`,
 * `<forinda-video-device-picker>`, and `<forinda-recorder>` with
 * `customElements`. Use `@forinda/video-sdk-elements/manual` if you need
 * to register manually (e.g., to control timing or use a custom tag name).
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

import { registerAll } from "./elements/register.ts";
registerAll();
