/**
 * Codec capability detection for client-side recording.
 *
 * Browsers vary widely in which `MediaRecorder` mime types they accept.
 * Chrome/Edge ship VP9 + Opus; Firefox prefers VP8 + Opus; Safari supports
 * H.264 + AAC inside MP4 (and only recently). We expose:
 *
 * - {@link DEFAULT_CODEC_PREFERENCES} — sensible fallback order tried when
 *   the consumer doesn't pin a `mimeType`.
 * - {@link isRecordingTypeSupported} — thin wrapper that's safe to call
 *   when `MediaRecorder` is undefined (SSR / older browsers).
 * - {@link pickRecordingType} — first-supported lookup against a list.
 */

/**
 * Default ordered fallback list. VP9 first because it's modern + universally
 * supported on Chromium; VP8 next for Firefox; bare `video/webm` and
 * `video/mp4` last as catch-alls (browsers fill in their own codec set).
 */
export const DEFAULT_CODEC_PREFERENCES = [
  "video/webm;codecs=vp9,opus",
  "video/webm;codecs=vp8,opus",
  "video/webm",
  "video/mp4",
] as const;

/**
 * Safe wrapper around `MediaRecorder.isTypeSupported`. Returns `false` when
 * the API is unavailable instead of throwing.
 */
export function isRecordingTypeSupported(mimeType: string): boolean {
  if (typeof MediaRecorder === "undefined") return false;
  return MediaRecorder.isTypeSupported(mimeType);
}

/**
 * Return the first entry in `preferences` that the current browser's
 * `MediaRecorder` accepts. Returns `null` when nothing matches (or the API
 * is unavailable entirely).
 */
export function pickRecordingType(preferences: readonly string[]): string | null {
  for (const t of preferences) {
    if (isRecordingTypeSupported(t)) return t;
  }
  return null;
}
