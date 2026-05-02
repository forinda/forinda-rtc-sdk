# @forinda/test-helpers

Internal test fixtures shared across the Forinda RTC SDK monorepo. **`private: true` — never published to npm.**

Workspace-only consumers depend on it via `"@forinda/test-helpers": "workspace:*"` in their `devDependencies`. Add `vitest` to your devDeps too — it's a peer.

## Helpers

### `defineFakePeerConnection()`

Hand-rolled `RTCPeerConnection` substitute for unit tests. Surface matches what the SDK actually uses (see `packages/core/src/peer/peer-connection.ts`), not the entire browser API. Two test-only escape hatches:

| Method                    | Purpose                                                      |
| ------------------------- | ------------------------------------------------------------ |
| `__fire(event, payload?)` | Manually dispatch a listener event with an optional payload. |
| `__setState(partial)`     | Patch the read-only state fields the wrapper reads.          |

Events recognised: `connectionstatechange`, `iceconnectionstatechange`, `icecandidate`, `track`.

```ts
import { defineFakePeerConnection } from "@forinda/test-helpers";

const pc = defineFakePeerConnection();
pc.__setState({ connectionState: "connecting" });
pc.__fire("connectionstatechange");
```

### `defineInMemoryTransportPair()`

Two paired `SignalingTransport`s connected to each other via `queueMicrotask` (no JSON, no network). `connect()` on either side flips both to `connected`; `disconnect()` flips both to `closed`. Messages sent on `a.send` arrive at handlers registered on `b.on("message", ...)` and vice versa.

Use this for publisher↔viewer choreography tests in core, react, and elements. Wire-format validation lives in `signaling-protocol`'s own suite — this fixture intentionally skips serialization.

```ts
const { publisher, viewer } = defineInMemoryTransportPair();
await publisher.connect(); // both sides flip to "connected"
viewer.on("message", (msg) => console.log("viewer received", msg));
await publisher.send({ type: "join", room: "demo", peer: "alice", role: "publisher" });
```

### `expectStateSequence(source, sequence, options?)`

Async assertion that resolves once the source has emitted the requested states **in order**. Intermediate non-matching states are tolerated — this is "saw these in order," not "saw exactly these." Rejects on timeout, including the states observed so far in the error message.

| Option      | Default | Description                |
| ----------- | ------- | -------------------------- |
| `timeoutMs` | `2000`  | Reject after this many ms. |

Two source shapes are accepted:

- `{ on(event: "state", handler): unsubscribe }` — the SDK Publisher / Viewer shape.
- `(handler) => unsubscribe` — a bare subscribe function.

```ts
await expectStateSequence(publisher, ["connecting", "connected"]);
```

### `defineDevServer(options?)`

Boots a real `defineSignalingServer` for the duration of a test. Default `port: 0` lets the OS assign a free port — important for parallel test runs. The handle exposes the actual `port` and a ready-to-use `url`.

| Option            | Default | Description                                     |
| ----------------- | ------- | ----------------------------------------------- |
| `port`            | `0`     | Bind port. Use `0` for OS-assigned random port. |
| `engine`          | —       | Forwarded to `defineSignalingServer`.           |
| `authenticate`    | —       | Forwarded to `defineSignalingServer`.           |
| `maxPeersPerRoom` | —       | Forwarded to `defineSignalingServer`.           |

```ts
import { defineDevServer } from "@forinda/test-helpers";

const server = await defineDevServer();
try {
  const transport = defineWebSocketSignaling({ url: server.url });
  // ...
} finally {
  await server.close();
}
```

### `recordRtpFlow(source, options?)`

Waits for the first `ConnectionStats` sample whose inbound bitrate is positive — i.e., proof that media actually flowed end-to-end (not just that ICE/DTLS connected). Resolves with the matching sample, rejects on timeout with the count of stat samples observed.

| Option      | Default                           | Description                            |
| ----------- | --------------------------------- | -------------------------------------- |
| `timeoutMs` | `5000`                            | Reject after this many ms.             |
| `predicate` | `(s) => s.inbound.bitrateBps > 0` | Override to assert a different signal. |

```ts
const stats = await recordRtpFlow(viewer, { timeoutMs: 5000 });
expect(stats.inbound.bitrateBps).toBeGreaterThan(0);
```

## Conventions

- Helpers use the project-wide `defineX({ ... })` factory style.
- All helpers are tree-shakeable — import only what you use.
- Test files in this package use the `@/*` path alias to mirror the rest of the workspace.

## Out of scope (for now)

- Vitest browser config (`@vitest/browser` + Playwright Chromium).
- Root-level `e2e/` Playwright project.

Both are on the roadmap and will be wired alongside the rest of the test matrix.
