# Quick start

A minimal mesh publisher in 15 lines. Run a signaling server in one terminal, then load the page in two browser tabs to see the publisher / viewer flow.

## 1. Run the signaling server

```bash
pnpm dlx @forinda/video-sdk-signaling-server --port 8787
```

## 2. Publish your camera

```ts
import { definePublisher, getUserMedia } from "@forinda/video-sdk-core";
import { defineWebSocketSignaling } from "@forinda/video-sdk-signaling-ws";

const stream = await getUserMedia({ audio: true, video: true });
const publisher = definePublisher({
  signaling: defineWebSocketSignaling({ url: "ws://localhost:8787" }),
  room: "demo",
  stream,
});

publisher.on("viewer", ({ peerId }) => console.log("viewer joined:", peerId));
await publisher.start();
```

## 3. View it from another tab

```ts
import { defineViewer } from "@forinda/video-sdk-core";
import { defineWebSocketSignaling } from "@forinda/video-sdk-signaling-ws";

const viewer = defineViewer({
  signaling: defineWebSocketSignaling({ url: "ws://localhost:8787" }),
  room: "demo",
});

viewer.on("track", ({ stream }) => {
  document.querySelector("video")!.srcObject = stream;
});
await viewer.start();
```

## Next

- Add presence + chat + recording over the same socket → [Patterns](/cookbook/patterns).
- Pick the right framework adapter → [Pick your stack](/get-started/pick-your-stack).
- Outgrow mesh? → [SFU integration](/cookbook/sfu-integration).
