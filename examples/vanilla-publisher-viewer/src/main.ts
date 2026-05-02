import { definePublisher, defineViewer, type ConnectionState } from "@forinda/video-sdk-core";
import { defineWebSocketSignaling } from "@forinda/video-sdk-signaling-ws";

const SIGNALING_URL = "ws://127.0.0.1:8787";
const ROOM = "demo";

const statusEl = document.querySelector<HTMLDivElement>("#status")!;
const videoEl = document.querySelector<HTMLVideoElement>("#video")!;
const linksEl = document.querySelector<HTMLDivElement>("#links")!;

function setStatus(msg: string): void {
  statusEl.textContent = msg;
}

function makeLink(href: string, text: string): HTMLAnchorElement {
  const a = document.createElement("a");
  a.href = href;
  a.textContent = text;
  return a;
}

function renderLinks(publisherId?: string): void {
  linksEl.replaceChildren();
  linksEl.appendChild(makeLink("#publisher", "publish"));
  linksEl.append(" | ");
  if (publisherId) {
    linksEl.appendChild(makeLink(`#viewer:${publisherId}`, "view this publisher"));
  } else {
    linksEl.append("(no publisher id yet)");
  }
}

async function runPublisher(): Promise<void> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
  videoEl.srcObject = stream;
  videoEl.classList.add("mirror");

  const signaling = defineWebSocketSignaling({ url: SIGNALING_URL });
  const publisher = definePublisher({ signaling, room: ROOM, stream });

  publisher.on("state", (s: ConnectionState) => setStatus(`publisher: ${s}`));
  publisher.on("viewer", ({ peerId }) => setStatus(`viewer joined: ${peerId}`));
  publisher.on("error", (err) => setStatus(`error: ${err.message}`));

  await publisher.start();
  renderLinks(publisher.peerId);
  setStatus(`publisher ready — peerId=${publisher.peerId}`);
}

async function runViewer(publisherId: string): Promise<void> {
  videoEl.muted = false;
  const signaling = defineWebSocketSignaling({ url: SIGNALING_URL });
  const viewer = defineViewer({ signaling, room: ROOM, publisherId });

  viewer.on("state", (s: ConnectionState) => setStatus(`viewer: ${s}`));
  viewer.on("track", ({ stream }) => {
    videoEl.srcObject = stream;
  });
  viewer.on("error", (err) => setStatus(`error: ${err.message}`));

  await viewer.start();
  setStatus(`viewer subscribed to ${publisherId}`);
}

function dispatch(): void {
  const hash = location.hash.slice(1);
  renderLinks();
  if (hash === "publisher") {
    void runPublisher();
  } else if (hash.startsWith("viewer:")) {
    void runViewer(hash.slice("viewer:".length));
  }
}

window.addEventListener("hashchange", () => location.reload());
dispatch();
