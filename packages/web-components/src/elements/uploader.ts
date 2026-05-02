/**
 * `<forinda-uploader>` — declarative companion to `<forinda-recorder>`.
 *
 * Reads `url`, `headers` (JSON), `max-queued-bytes`, and `keepalive-threshold`
 * attributes. Exposes a lazily-built `Uploader` via the `.uploader` getter
 * — the recorder element queries slotted `<forinda-uploader>` children at
 * `start()` and pipes each chunk to them.
 *
 * Headers parse failures fall back silently to no headers (with a
 * `console.warn` to flag the malformed JSON).
 *
 * @example
 * ```html
 * <forinda-recorder for="my-publisher">
 *   <forinda-uploader url="/api/uploads" headers='{"Authorization":"Bearer t"}'></forinda-uploader>
 * </forinda-recorder>
 * ```
 */

import { defineUploader, type Uploader } from "@forinda/video-sdk-core";
import { readNumber, readString } from "@/internal/attrs.ts";

export class ForindaUploader extends HTMLElement {
  static readonly tagName = "forinda-uploader";

  private uploaderInstance: Uploader | null = null;
  /** Test seam — replaces the global `fetch` for this instance. */
  fetchImpl?: typeof fetch;

  /** Lazily built `Uploader`, returns `null` when no `url` attribute is set. */
  get uploader(): Uploader | null {
    if (this.uploaderInstance !== null) return this.uploaderInstance;
    const url = readString(this, "url");
    if (url === null) return null;
    const headers = this.parseHeaders();
    const maxQueuedBytes = readNumber(this, "max-queued-bytes", 0);
    const keepaliveThreshold = readNumber(this, "keepalive-threshold", 0);
    this.uploaderInstance = defineUploader({
      url,
      ...(headers !== null ? { headers } : {}),
      ...(maxQueuedBytes > 0 ? { maxQueuedBytes } : {}),
      ...(keepaliveThreshold > 0 ? { keepaliveThresholdBytes: keepaliveThreshold } : {}),
      ...(this.fetchImpl !== undefined ? { fetchImpl: this.fetchImpl } : {}),
    });
    return this.uploaderInstance;
  }

  disconnectedCallback(): void {
    this.uploaderInstance?.close();
    this.uploaderInstance = null;
  }

  private parseHeaders(): Record<string, string> | null {
    const raw = readString(this, "headers");
    if (raw === null) return null;
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) return null;
      const out: Record<string, string> = {};
      for (const [k, v] of Object.entries(parsed)) {
        if (typeof v === "string") out[k] = v;
      }
      return out;
    } catch {
      // Soft-fail on bad JSON — surface a console warning so devs notice.
      // eslint-disable-next-line no-console
      console.warn("forinda-uploader: failed to parse `headers` attribute as JSON");
      return null;
    }
  }
}
