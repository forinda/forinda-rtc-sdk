/**
 * `<forinda-video-device-picker>` — declarative `<select>` populated with the
 * user's cameras / microphones / speakers.
 *
 * Subscribes to {@link watchDevices} so hotplug updates the list automatically.
 * Emits a `change` `CustomEvent` whose detail is the selected `deviceId`.
 *
 * @example
 * ```html
 * <forinda-video-device-picker kind="camera" placeholder="Camera"></forinda-video-device-picker>
 * ```
 *
 * @fires change — `CustomEvent<{ deviceId: string; label: string }>`
 * @fires error  — `CustomEvent<Error>`
 */

import { watchDevices, type DeviceList } from "@forinda/video-sdk-core";
import { readString } from "@/internal/attrs.ts";
import { dispatchTypedEvent } from "@/internal/send-event.ts";

export type DeviceKind = "camera" | "microphone" | "speaker";

export interface DevicePickerOverrides {
  watchDevices?: typeof watchDevices;
}

const STYLE_CSS = `
  :host { display: inline-block; }
  select {
    font: inherit;
    padding: 0.25rem 0.5rem;
  }
`;

function buildShadow(host: HTMLElement): HTMLSelectElement {
  const shadow = host.attachShadow({ mode: "open" });
  const style = document.createElement("style");
  style.textContent = STYLE_CSS;
  const select = document.createElement("select");
  select.setAttribute("part", "select");
  shadow.append(style, select);
  return select;
}

function pickList(devices: DeviceList, kind: DeviceKind): MediaDeviceInfo[] {
  if (kind === "camera") return devices.cameras;
  if (kind === "microphone") return devices.microphones;
  return devices.speakers;
}

export class ForindaVideoDevicePicker extends HTMLElement {
  static readonly tagName = "forinda-video-device-picker";

  overrides: DevicePickerOverrides = {};

  private selectEl: HTMLSelectElement;
  private unsubscribe: (() => void) | null = null;

  constructor() {
    super();
    this.selectEl = buildShadow(this);
    this.selectEl.addEventListener("change", () => {
      const option = this.selectEl.selectedOptions[0];
      dispatchTypedEvent(this, "change", {
        deviceId: this.selectEl.value,
        label: option?.textContent ?? "",
      });
    });
  }

  connectedCallback(): void {
    if (this.unsubscribe) return;
    const kind = (readString(this, "kind") ?? "camera") as DeviceKind;
    const placeholder = readString(this, "placeholder") ?? "Select a device";

    const watcher = this.overrides.watchDevices ?? watchDevices;
    try {
      this.unsubscribe = watcher((devices) => this.render(pickList(devices, kind), placeholder));
    } catch (err) {
      this.emitError(err);
    }
  }

  disconnectedCallback(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
  }

  /** Currently selected device id, or empty string when no selection. */
  get value(): string {
    return this.selectEl.value;
  }

  set value(deviceId: string) {
    this.selectEl.value = deviceId;
  }

  private render(devices: MediaDeviceInfo[], placeholder: string): void {
    const previous = this.selectEl.value;
    const fragment = document.createDocumentFragment();

    const placeholderOpt = document.createElement("option");
    placeholderOpt.value = "";
    placeholderOpt.textContent = placeholder;
    placeholderOpt.disabled = true;
    fragment.appendChild(placeholderOpt);

    for (const d of devices) {
      const opt = document.createElement("option");
      opt.value = d.deviceId;
      opt.textContent = d.label || `${d.kind} ${d.deviceId.slice(0, 6)}`;
      fragment.appendChild(opt);
    }

    this.selectEl.replaceChildren(fragment);
    if (devices.some((d) => d.deviceId === previous)) {
      this.selectEl.value = previous;
    } else if (devices.length > 0) {
      this.selectEl.value = devices[0]!.deviceId;
    }
  }

  private emitError(err: unknown): void {
    const error = err instanceof Error ? err : new Error(String(err));
    dispatchTypedEvent(this, "error", error);
  }
}
