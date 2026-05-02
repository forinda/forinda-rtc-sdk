import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ForindaRecorder } from "@/elements/recorder.ts";
import { ForindaUploader } from "@/elements/uploader.ts";
import { installFakeMediaRecorder, type InstalledFakeRecorder } from "@forinda/test-helpers";

let fx: InstalledFakeRecorder;

beforeEach(() => {
  fx = installFakeMediaRecorder();
  if (typeof URL.createObjectURL !== "function") {
    (URL as unknown as { createObjectURL: (b: Blob) => string }).createObjectURL = () =>
      "blob:fake";
  } else {
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:fake");
  }
});

afterEach(() => {
  fx.cleanup();
  vi.restoreAllMocks();
});

if (!customElements.get(ForindaRecorder.tagName)) {
  customElements.define(ForindaRecorder.tagName, ForindaRecorder);
}
if (!customElements.get(ForindaUploader.tagName)) {
  customElements.define(ForindaUploader.tagName, ForindaUploader);
}

const fakeStream = (): MediaStream => ({}) as unknown as MediaStream;

function makeEl(attrs: Record<string, string> = {}): ForindaRecorder {
  const el = document.createElement(ForindaRecorder.tagName) as ForindaRecorder;
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  return el;
}

describe("<forinda-recorder>", () => {
  it("renders a shadow DOM toolbar with a button + status part", () => {
    const el = makeEl();
    document.body.appendChild(el);

    const button = el.shadowRoot?.querySelector('button[part="button"]');
    const status = el.shadowRoot?.querySelector('span[part="status"]');
    expect(button?.textContent).toBe("Record");
    expect(status?.textContent).toBe("idle");
    el.remove();
  });

  it("emits an error when start() is called without a stream", () => {
    const el = makeEl();
    document.body.appendChild(el);
    const handler = vi.fn();
    el.addEventListener("recorder-error", handler);

    el.start();

    expect(handler).toHaveBeenCalledOnce();
    const detail = (handler.mock.calls[0]?.[0] as CustomEvent<Error>).detail;
    expect(detail.message).toMatch(/stream/);
    el.remove();
  });

  it("constructs the recorder with mime-type, video-bps, audio-bps, timeslice-ms attrs", () => {
    const el = makeEl({
      "mime-type": "video/mp4",
      "video-bps": "2500000",
      "audio-bps": "128000",
      "timeslice-ms": "200",
    });
    el.stream = fakeStream();
    document.body.appendChild(el);

    el.start();

    expect(fx.current?.start).toHaveBeenCalledWith(200);
    el.remove();
  });

  it("clicking the toolbar button starts the recorder, second click stops it", async () => {
    const el = makeEl();
    el.stream = fakeStream();
    document.body.appendChild(el);
    const button = el.shadowRoot?.querySelector("button") as HTMLButtonElement;

    button.click();
    expect(fx.current?.start).toHaveBeenCalledOnce();
    expect(button.textContent).toBe("Stop");

    button.click();
    expect(fx.current?.stop).toHaveBeenCalledOnce();
    el.remove();
  });

  it("fires recorder-stop with blob, mimeType, durationMs, and url on stop", async () => {
    const el = makeEl();
    el.stream = fakeStream();
    document.body.appendChild(el);

    const stopHandler = vi.fn();
    el.addEventListener("recorder-stop", stopHandler);

    el.start();
    fx.current?.__fire("dataavailable", { data: new Blob(["x"], { type: "video/webm" }) });
    const stopPromise = el.stop();
    fx.current?.__fire("stop");
    await stopPromise;

    expect(stopHandler).toHaveBeenCalledOnce();
    const detail = (
      stopHandler.mock.calls[0]?.[0] as CustomEvent<{
        blob: Blob;
        mimeType: string;
        url: string;
      }>
    ).detail;
    expect(detail.blob).toBeInstanceOf(Blob);
    expect(detail.url).toBe("blob:fake");
    el.remove();
  });

  it("auto-starts when 'auto-start' attribute is present and stream is set", () => {
    const el = makeEl({ "auto-start": "" });
    document.body.appendChild(el);
    expect(fx.current).toBeNull();

    el.stream = fakeStream();
    expect(fx.current?.start).toHaveBeenCalledOnce();
    el.remove();
  });

  it("disconnectedCallback stops an active recording", () => {
    const el = makeEl();
    el.stream = fakeStream();
    document.body.appendChild(el);
    el.start();

    el.remove();

    expect(fx.current?.stop).toHaveBeenCalledOnce();
  });
});

describe("<forinda-recorder> — for= + slotted uploader (EPIC-21)", () => {
  function mount(opts: { forId?: string; slotted?: { url: string } } = {}): ForindaRecorder {
    const el = document.createElement("forinda-recorder") as ForindaRecorder;
    if (opts.forId !== undefined) el.setAttribute("for", opts.forId);
    if (opts.slotted !== undefined) {
      const u = document.createElement("forinda-uploader");
      u.setAttribute("url", opts.slotted.url);
      el.appendChild(u);
    }
    document.body.appendChild(el);
    return el;
  }

  it("snapshots the target's mediaStream at start() time when for= is set", () => {
    const target = document.createElement("div") as HTMLDivElement & {
      mediaStream?: MediaStream;
    };
    target.id = "src";
    const stream = { id: "fake" } as unknown as MediaStream;
    target.mediaStream = stream;
    document.body.appendChild(target);

    const el = mount({ forId: "src" });
    el.start();

    expect(el.stream).toBe(stream);
  });

  it("emits an error when for= references a missing element", () => {
    const el = mount({ forId: "ghost" });
    const errors: Error[] = [];
    el.addEventListener("recorder-error", (e) => errors.push((e as CustomEvent<Error>).detail));
    el.start();
    expect(errors[0]?.message).toMatch(/for="ghost"/);
  });

  it("emits an error when the for= target lacks a mediaStream property", () => {
    const target = document.createElement("div");
    target.id = "bad";
    document.body.appendChild(target);

    const el = mount({ forId: "bad" });
    const errors: Error[] = [];
    el.addEventListener("recorder-error", (e) => errors.push((e as CustomEvent<Error>).detail));
    el.start();
    expect(errors[0]?.message).toMatch(/mediaStream/);
  });

  it("pipes to slotted <forinda-uploader> children when started", async () => {
    const fetchImpl = vi.fn(async () => new Response("ok", { status: 200 }));
    const recorderEl = mount({ slotted: { url: "https://t/u" } });
    const uploaderEl = recorderEl.querySelector("forinda-uploader") as ForindaUploader;
    uploaderEl.fetchImpl = fetchImpl;
    recorderEl.stream = { id: "src" } as unknown as MediaStream;
    recorderEl.start();

    fx.current?.__fire("dataavailable", { data: new Blob(["x"]) });
    await Promise.resolve();
    await Promise.resolve();

    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});
