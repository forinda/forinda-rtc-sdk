import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { useVideoSdkConfig, VideoSdkProvider } from "@/provider.tsx";

function Probe({ onConfig }: { onConfig: (c: ReturnType<typeof useVideoSdkConfig>) => void }) {
  const config = useVideoSdkConfig();
  onConfig(config);
  return null;
}

describe("VideoSdkProvider + useVideoSdkConfig", () => {
  it("returns empty config when no provider mounted", () => {
    let captured: unknown;
    render(<Probe onConfig={(c) => (captured = c)} />);
    expect(captured).toEqual({});
  });

  it("supplies the config from the nearest provider", () => {
    let captured: unknown;
    const iceServers = [{ urls: "stun:stun.l.google.com:19302" }];
    render(
      <VideoSdkProvider iceServers={iceServers}>
        <Probe onConfig={(c) => (captured = c)} />
      </VideoSdkProvider>,
    );
    expect(captured).toEqual({ iceServers });
  });

  it("forwards signaling factory and retry config", () => {
    let captured: ReturnType<typeof useVideoSdkConfig> | undefined;
    const signaling = () => ({}) as never;
    const retry = { maxAttempts: 3 };
    render(
      <VideoSdkProvider signaling={signaling} retry={retry}>
        <Probe onConfig={(c) => (captured = c)} />
      </VideoSdkProvider>,
    );
    expect(captured?.signaling).toBe(signaling);
    expect(captured?.retry).toBe(retry);
  });
});
