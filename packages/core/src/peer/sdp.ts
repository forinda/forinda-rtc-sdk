/**
 * Lightweight SDP read helpers.
 *
 * v0.1.0 only needs to *inspect* SDP — codec preference rewriting is
 * deferred to a later epic where real consumer demand drives the shape.
 *
 * SDP is a line-oriented format with `m=` lines starting media sections and
 * `a=rtpmap:` lines mapping a payload-type number to a codec name. These
 * helpers parse only what's needed; they do not validate the whole SDP.
 */

/** Test whether the SDP contains a media section of the given kind. */
export function hasMediaSection(sdp: string, kind: "audio" | "video"): boolean {
  return sdp.split(/\r?\n/).some((line) => line.startsWith(`m=${kind} `));
}

/**
 * List `(payloadType, codec)` pairs declared in the named media section.
 * Codec names are returned exactly as they appear in `rtpmap` (case
 * preserved — e.g. `"VP8"`, `"H264"`, `"opus"`).
 */
export function listCodecPayloadTypes(
  sdp: string,
  kind: "audio" | "video",
): { pt: string; codec: string }[] {
  const lines = sdp.split(/\r?\n/);
  const out: { pt: string; codec: string }[] = [];
  let inSection = false;
  const rtpmapRegex = /^a=rtpmap:(\d+)\s+([A-Za-z0-9]+)/;
  for (const line of lines) {
    if (line.startsWith("m=")) {
      inSection = line.startsWith(`m=${kind} `);
      continue;
    }
    if (!inSection) continue;
    const match = rtpmapRegex.exec(line);
    if (match !== null) {
      out.push({ pt: match[1] as string, codec: match[2] as string });
    }
  }
  return out;
}
