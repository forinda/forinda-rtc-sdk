# @forinda/video-sdk-signaling-adapter-bun

Native Bun WebSocket signaling server adapter for the Forinda RTC SDK.

> ⚠️ **Stub package — implementation deferred.** Reserved on the registry but currently exports an empty surface. Use the workaround below.

## Status

Bun ships its own WebSocket server (`Bun.serve({ websocket: ... })`) with a different shape from Node's `ws`. A native adapter that talks to Bun's server directly (instead of going through `ws`) avoids a redundant dependency and gets Bun's tighter perf characteristics. That adapter is a planned epic; this package is a placeholder until then.

## Workaround

Bun is API-compatible with Node's `ws` package, so [`@forinda/video-sdk-signaling-adapter-ws`](https://www.npmjs.com/package/@forinda/video-sdk-signaling-adapter-ws) works on Bun **today** with no changes:

```ts
// works under Bun:
import { defineWebSocketSignalingServer } from "@forinda/video-sdk-signaling-adapter-ws";

const server = defineWebSocketSignalingServer({ port: 8787 });
console.log("signaling on ws://127.0.0.1:8787");
```

You'll have a `ws` dependency in your bundle that you wouldn't strictly need with a native adapter, but it's a small price (~30 KB unminified) and the code is identical to the Node path.

## When this lands

If you have a production Bun deployment that would benefit from a native adapter, open an issue with a benchmark and we'll prioritize.

## License

MIT.
