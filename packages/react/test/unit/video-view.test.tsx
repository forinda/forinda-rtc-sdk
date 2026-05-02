import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { useRef } from "react";
import { VideoView } from "@/video-view.tsx";

describe("VideoView", () => {
  it("renders a video element", () => {
    const { container } = render(<VideoView stream={null} />);
    expect(container.querySelector("video")).not.toBeNull();
  });

  it("forwards ref to the underlying video element", () => {
    let captured: HTMLVideoElement | null = null;
    function Wrapper() {
      const ref = useRef<HTMLVideoElement | null>(null);
      return (
        <VideoView
          stream={null}
          ref={(el) => {
            ref.current = el;
            captured = el;
          }}
        />
      );
    }
    render(<Wrapper />);
    expect(captured).not.toBeNull();
    expect((captured as HTMLVideoElement | null)?.tagName).toBe("VIDEO");
  });

  it("applies mirror style when mirror prop is true", () => {
    const { container } = render(<VideoView stream={null} mirror />);
    const video = container.querySelector("video");
    expect(video?.style.transform).toBe("scaleX(-1)");
  });

  it("merges consumer-provided style with mirror style", () => {
    const { container } = render(
      <VideoView stream={null} mirror style={{ borderRadius: "8px" }} />,
    );
    const video = container.querySelector("video");
    expect(video?.style.transform).toBe("scaleX(-1)");
    expect(video?.style.borderRadius).toBe("8px");
  });

  it("forwards arbitrary video attributes", () => {
    const { container } = render(<VideoView stream={null} muted autoPlay playsInline />);
    const video = container.querySelector("video");
    expect(video?.muted).toBe(true);
    expect(video?.autoplay).toBe(true);
    expect(video?.playsInline).toBe(true);
  });

  it("sets srcObject when stream is provided", () => {
    const fakeStream = { id: "fake" } as unknown as MediaStream;
    const { container } = render(<VideoView stream={fakeStream} />);
    const video = container.querySelector("video") as HTMLVideoElement;
    expect(video.srcObject).toBe(fakeStream);
  });
});
