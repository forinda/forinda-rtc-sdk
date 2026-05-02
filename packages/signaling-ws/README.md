# @forinda/video-sdk-signaling-ws

Browser WebSocket client transport for the Forinda RTC SDK. Implements the `SignalingTransport` interface from `@forinda/video-sdk-core` over a real `WebSocket`, with auto-reconnect, outbound buffering, and ping/pong heartbeat.

## Install

```bash
pnpm add @forinda/video-sdk-signaling-ws @forinda/video-sdk-core
```

## Usage

```ts
import { defineWebSocketSignaling } from "@forinda/video-sdk-signaling-ws";

const signaling = defineWebSocketSignaling({
  url: "wss://signal.example.com",
  reconnect: true,
  heartbeatIntervalMs: 30_000,
  auth: async () => fetchAuthToken(),
});

// Pass to definePublisher / defineViewer:
const publisher = definePublisher({ signaling, room: "demo", stream });
await publisher.start();
```

## Options

| Option                | Default                       | Notes                                                           |
| --------------------- | ----------------------------- | --------------------------------------------------------------- |
| `url`                 | required                      | `wss://...` or `ws://...` endpoint.                             |
| `protocols`           | none                          | Forwarded to the `WebSocket` constructor.                       |
| `wsFactory`           | `(...) => new WebSocket(...)` | Override for tests / custom transports.                         |
| `reconnect`           | `true`                        | Auto-reconnect on unexpected close.                             |
| `backoff.initialMs`   | `1000`                        | First reconnect delay.                                          |
| `backoff.maxMs`       | `30000`                       | Cap for exponential growth.                                     |
| `backoff.jitter`      | `0.25`                        | ±25% random jitter.                                             |
| `heartbeatIntervalMs` | `30000`                       | Ping interval. `0` disables.                                    |
| `auth`                | none                          | Async returns token; appended as `?token=...` on every connect. |

## Behavior

- **Outbound buffering:** messages sent while not yet `connected` are queued and flushed in registration order on open. Buffer survives reconnect.
- **Heartbeat:** sends literal `{"type":"ping"}` every `heartbeatIntervalMs`; force-reconnects if no inbound activity for `2× heartbeatIntervalMs`.
- **Validation:** every inbound message validates against the wire-format schema from `@forinda/video-sdk-signaling-protocol`. Malformed payloads are dropped with a warn log.
- **Reconnect loop is unbounded.** Session-level give-up is the consumer's responsibility (Publisher/Viewer use `RetryPolicy` for that).

## License

MIT — © 2026 Felix Orinda.
