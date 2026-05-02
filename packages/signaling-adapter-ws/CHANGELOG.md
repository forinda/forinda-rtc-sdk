# @forinda/video-sdk-signaling-adapter-ws

## 0.1.0

### Minor Changes

Initial public release.

- `defineWebSocketSignalingServer({ port?, wss?, engine?, authenticate?, maxPeersPerRoom?, socketId?, extractToken? })` — wires a `SignalingEngine` (from `@forinda/video-sdk-signaling-protocol`) to a Node `ws.WebSocketServer`. Bring your own `wss` for sharing with an existing HTTP server, or pass a `port` to spin one up.
- Returns `{ wss, engine, session, close() }`.
