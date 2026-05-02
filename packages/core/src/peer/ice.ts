/**
 * Normalize and validate ICE server configurations.
 *
 * The browser's `RTCIceServer` shape is permissive — `urls` can be a string
 * or array, credentials are optional. This helper accepts a more ergonomic
 * input (raw URL strings, arrays of URLs, or full RTCIceServer objects) and
 * returns a uniform `RTCIceServer[]` ready to pass to `RTCPeerConnection`.
 *
 * Validation rules (kept narrow on purpose):
 * - URL scheme must be `stun:`, `stuns:`, `turn:`, or `turns:`.
 * - TURN(S) entries must carry `username` and `credential` — the browser
 *   accepts missing creds but the connection silently fails.
 */

import { ConfigurationError } from "@/errors/errors.ts";

/**
 * Allowed input shapes for {@link normalizeIceServers}:
 *
 * - `string` — a single URL.
 * - `string[]` — multiple URLs for the same logical server.
 * - `RTCIceServer` — the raw browser type.
 */
export type IceServerConfig = string | string[] | RTCIceServer;

const ALLOWED_SCHEMES = new Set(["stun:", "stuns:", "turn:", "turns:"]);

function urlScheme(url: string): string {
  const colon = url.indexOf(":");
  if (colon === -1) return "";
  return url.slice(0, colon + 1).toLowerCase();
}

function validateUrl(url: string): void {
  const scheme = urlScheme(url);
  if (!ALLOWED_SCHEMES.has(scheme)) {
    throw new ConfigurationError(
      `ICE server URL must use stun:, stuns:, turn:, or turns: — got "${url}"`,
    );
  }
}

function isTurn(url: string): boolean {
  const scheme = urlScheme(url);
  return scheme === "turn:" || scheme === "turns:";
}

function asArray(urls: string | string[]): string[] {
  return Array.isArray(urls) ? urls : [urls];
}

/** Normalize a mixed input into a validated `RTCIceServer[]`. */
export function normalizeIceServers(input: IceServerConfig[]): RTCIceServer[] {
  const out: RTCIceServer[] = [];
  for (const item of input) {
    if (typeof item === "string") {
      validateUrl(item);
      out.push({ urls: item });
      continue;
    }
    if (Array.isArray(item)) {
      for (const u of item) validateUrl(u);
      out.push({ urls: item });
      continue;
    }
    const urls = asArray(item.urls);
    for (const u of urls) validateUrl(u);
    if (urls.some(isTurn) && (item.username === undefined || item.credential === undefined)) {
      throw new ConfigurationError(
        `TURN server requires username and credential — got "${urls.join(",")}"`,
      );
    }
    out.push(item);
  }
  return out;
}
