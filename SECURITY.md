# Security policy

## Reporting a vulnerability

WebRTC is a security-sensitive surface. If you find a vulnerability in any package in this repository — especially in:

- `@forinda/video-sdk-core` (peer-connection lifecycle, ICE / DTLS handling)
- `@forinda/video-sdk-signaling-protocol` / `signaling-server` / `signaling-adapter-*` (auth, validation, rate limits)
- `@forinda/video-sdk-react`, `@forinda/video-sdk-elements` (XSS, prototype pollution via JSON presence values, autoplay bypass)
- `@forinda/video-sdk-recorder` and Recorder buffer handling (memory exhaustion, untrusted blob handling)

**please do not file a public issue.** Instead, email the maintainer at **forinda82@gmail.com** with:

- A clear description of the issue.
- Reproduction steps (a minimal repo or gist is ideal).
- Affected package(s) and version(s).
- Your assessment of impact (information disclosure, denial of service, peer hijack, remote code execution).

You should receive an acknowledgement within 5 business days. We will work with you on a coordinated disclosure timeline (typically 14–30 days depending on severity).

## Supported versions

Pre-1.0: only the latest published version is supported. Once we ship 1.0 we will document a maintenance window per the semver-major schedule.

## Hardening defaults

- `signaling-protocol` validates every inbound message via zod at the boundary; malformed payloads throw `SignalingValidationError`.
- `RoomChannel`, `Publisher`, and `Viewer` reject `presence-update` / `chat` / `sdp` / `ice` claiming a `peer` that doesn't match the socket's bound peerId.
- `Recorder` accepts `maxBufferedBytes` to bound memory growth on long recordings.
- Default room capacity is 50 peers; override via `defineSignalingEngine({ maxPeersPerRoom })`.
- Per-peer rate limits on `presence-update` and `chat` are planned for EPIC-22 — until then, hosts should rate-limit at the WebSocket layer (e.g. `ws.WebSocketServer({ maxPayload, perMessageDeflate: false })` plus a token bucket).

## Out of scope

- TURN / STUN server hardening — bring your own infrastructure; we don't ship a relay.
- Application-layer authentication beyond the `authenticate` callback hook — adopters wire their own JWT / session validation.
- Dependencies of dependencies — please report upstream where possible.
