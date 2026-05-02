/**
 * Ergonomic builders for {@link MediaStreamConstraints}.
 *
 * The browser API accepts either `boolean` or a fully-specified
 * {@link MediaTrackConstraints} object for each kind. This helper preserves
 * that flexibility while letting consumers pass a small object when they
 * just want resolution/deviceId hints.
 *
 * Defaults: when an option is omitted, the kind is treated as `true`
 * (request the default device). To explicitly opt out, pass `false`.
 */

/** Options for {@link buildConstraints}. Accepts boolean shorthand or detail. */
export interface CaptureOptions {
  audio?: boolean | MediaTrackConstraints;
  video?: boolean | MediaTrackConstraints;
}

/**
 * Build a {@link MediaStreamConstraints} object suitable for `getUserMedia`.
 * Missing kinds default to `true`.
 */
export function buildConstraints(opts: CaptureOptions): MediaStreamConstraints {
  return {
    audio: opts.audio ?? true,
    video: opts.video ?? true,
  };
}
