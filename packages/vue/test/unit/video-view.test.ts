import { beforeAll, describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import { VideoView } from "@/video-view.ts";

// jsdom's HTMLMediaElement#srcObject setter is a no-op (it accepts the
// value but never persists it). Replace with a plain data-property
// accessor so the component's assignment + readback round-trips.
beforeAll(() => {
  Object.defineProperty(HTMLMediaElement.prototype, "srcObject", {
    configurable: true,
    get() {
      return (this as unknown as { __srcObject: MediaStream | null }).__srcObject ?? null;
    },
    set(v: MediaStream | null) {
      (this as unknown as { __srcObject: MediaStream | null }).__srcObject = v;
    },
  });
});

const fakeStream = (id = "stream-1"): MediaStream =>
  ({ id, getTracks: () => [] }) as unknown as MediaStream;

describe("VideoView", () => {
  it("renders a <video> element", () => {
    const wrapper = mount(VideoView, { props: { stream: null } });
    expect(wrapper.element.tagName).toBe("VIDEO");
    wrapper.unmount();
  });

  it("assigns srcObject to the underlying element", async () => {
    const stream = fakeStream();
    const wrapper = mount(VideoView, { props: { stream } });
    // flush post-watch
    await wrapper.vm.$nextTick();
    expect((wrapper.element as HTMLVideoElement).srcObject).toBe(stream);
    wrapper.unmount();
  });

  it("clears srcObject when stream prop becomes null", async () => {
    const stream = fakeStream();
    const wrapper = mount(VideoView, { props: { stream } });
    await wrapper.vm.$nextTick();
    expect((wrapper.element as HTMLVideoElement).srcObject).toBe(stream);
    await wrapper.setProps({ stream: null });
    expect((wrapper.element as HTMLVideoElement).srcObject).toBeNull();
    wrapper.unmount();
  });

  it("applies mirror transform when mirror is true", () => {
    const wrapper = mount(VideoView, { props: { stream: null, mirror: true } });
    const style = (wrapper.element as HTMLElement).getAttribute("style") ?? "";
    expect(style).toContain("scaleX(-1)");
    wrapper.unmount();
  });

  it("forwards <video> attributes via $attrs", () => {
    const wrapper = mount(VideoView, {
      props: { stream: null },
      attrs: { autoplay: true, playsinline: true, muted: true, "data-testid": "preview" },
    });
    const el = wrapper.element as HTMLVideoElement;
    expect(el.getAttribute("autoplay")).not.toBeNull();
    expect(el.getAttribute("data-testid")).toBe("preview");
    wrapper.unmount();
  });

  it("exposes the video element via expose", () => {
    const wrapper = mount(VideoView, { props: { stream: null } });
    const exposed = wrapper.vm as unknown as { video: HTMLVideoElement | null };
    expect(exposed.video).toBeInstanceOf(HTMLVideoElement);
    wrapper.unmount();
  });

  it("detaches srcObject on unmount", async () => {
    const stream = fakeStream();
    const wrapper = mount(VideoView, { props: { stream } });
    await wrapper.vm.$nextTick();
    const el = wrapper.element as HTMLVideoElement;
    expect(el.srcObject).toBe(stream);
    wrapper.unmount();
    expect(el.srcObject).toBeNull();
  });
});
