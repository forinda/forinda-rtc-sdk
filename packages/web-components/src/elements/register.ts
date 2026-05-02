/**
 * Idempotent custom-element registration. Calling `registerAll()` more than
 * once is a no-op, and re-registering a tag already taken by another
 * implementation is silently skipped (consumer-defined elements win).
 */

import { ForindaRecorder } from "@/elements/recorder.ts";
import { ForindaVideoDevicePicker } from "@/elements/video-device-picker.ts";
import { ForindaVideoPublisher } from "@/elements/video-publisher.ts";
import { ForindaVideoViewer } from "@/elements/video-viewer.ts";

type ElementCtor = CustomElementConstructor & { tagName: string };

const ELEMENTS: ElementCtor[] = [
  ForindaVideoPublisher,
  ForindaVideoViewer,
  ForindaVideoDevicePicker,
  ForindaRecorder,
];

export function registerAll(): void {
  if (typeof customElements === "undefined") return;
  for (const ctor of ELEMENTS) {
    if (!customElements.get(ctor.tagName)) {
      customElements.define(ctor.tagName, ctor);
    }
  }
}
