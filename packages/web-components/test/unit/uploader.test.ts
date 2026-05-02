import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ForindaUploader } from "@/elements/uploader.ts";
import { registerAll } from "@/elements/register.ts";

beforeEach(() => {
  registerAll();
});
afterEach(() => {
  while (document.body.firstChild) document.body.removeChild(document.body.firstChild);
});

function mountUploader(attrs: Record<string, string>): ForindaUploader {
  const el = document.createElement("forinda-uploader") as ForindaUploader;
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  document.body.appendChild(el);
  return el;
}

describe("<forinda-uploader>", () => {
  it("registers the custom element", () => {
    expect(customElements.get("forinda-uploader")).toBe(ForindaUploader);
  });

  it("reads url + headers attributes and exposes an uploader", async () => {
    const fetchImpl: typeof fetch = vi.fn(async () => new Response("ok", { status: 200 }));
    const el = mountUploader({
      url: "https://example.test/u",
      headers: '{"Authorization":"Bearer abc"}',
    });
    el.fetchImpl = fetchImpl;

    const uploader = el.uploader;
    expect(uploader).not.toBeNull();
    await uploader!.send(new Blob(["x"], { type: "application/octet-stream" }));

    const mock = fetchImpl as unknown as ReturnType<typeof vi.fn>;
    expect(mock).toHaveBeenCalledTimes(1);
    const init = mock.mock.calls[0]![1] as RequestInit;
    expect(new Headers(init.headers).get("Authorization")).toBe("Bearer abc");
  });

  it("returns null from .uploader before a url is set", () => {
    const el = mountUploader({});
    expect(el.uploader).toBeNull();
  });
});
