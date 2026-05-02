import "@forinda/video-sdk-elements";

const SIGNALING_URL = "ws://127.0.0.1:8787";
const ROOM = "demo";

const slot = document.querySelector<HTMLDivElement>("#slot")!;
const statusEl = document.querySelector<HTMLParagraphElement>("#status")!;
const pubInput = document.querySelector<HTMLInputElement>("#pub-id")!;

function setStatus(msg: string): void {
  statusEl.textContent = msg;
}

function mountPublisher(): void {
  slot.replaceChildren();
  const pub = document.createElement("forinda-video-publisher");
  pub.setAttribute("room", ROOM);
  pub.setAttribute("signaling-url", SIGNALING_URL);
  pub.setAttribute("audio", "");
  pub.setAttribute("video", "");
  pub.setAttribute("mirror", "");
  pub.addEventListener("ready", (e) => {
    const detail = (e as CustomEvent<{ publisher: { peerId: string } }>).detail;
    setStatus(`publisher ready — peerId=${detail.publisher.peerId}`);
  });
  pub.addEventListener("error", (e) => {
    setStatus(`error: ${(e as unknown as CustomEvent<Error>).detail.message}`);
  });
  slot.appendChild(pub);
}

function mountViewer(publisherId: string): void {
  slot.replaceChildren();
  const view = document.createElement("forinda-video-viewer");
  view.setAttribute("room", ROOM);
  view.setAttribute("publisher-id", publisherId);
  view.setAttribute("signaling-url", SIGNALING_URL);
  view.addEventListener("track", () => setStatus(`viewing ${publisherId}`));
  view.addEventListener("error", (e) => {
    setStatus(`error: ${(e as unknown as CustomEvent<Error>).detail.message}`);
  });
  slot.appendChild(view);
}

document.querySelector("#publish-btn")!.addEventListener("click", mountPublisher);
document.querySelector("#view-btn")!.addEventListener("click", () => {
  if (pubInput.value) mountViewer(pubInput.value);
});
