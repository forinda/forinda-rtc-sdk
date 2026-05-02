import { describe, expect, it } from "vitest";
import { hasMediaSection, listCodecPayloadTypes } from "@/peer/sdp.ts";

const SAMPLE_SDP = `v=0
o=- 4611734830049884136 2 IN IP4 127.0.0.1
s=-
t=0 0
a=group:BUNDLE 0 1
m=audio 9 UDP/TLS/RTP/SAVPF 111 103 9
c=IN IP4 0.0.0.0
a=rtpmap:111 opus/48000/2
a=rtpmap:103 ISAC/16000
a=rtpmap:9 G722/8000
a=mid:0
m=video 9 UDP/TLS/RTP/SAVPF 96 97 98
c=IN IP4 0.0.0.0
a=rtpmap:96 VP8/90000
a=rtpmap:97 H264/90000
a=rtpmap:98 AV1/90000
a=mid:1
`;

describe("hasMediaSection", () => {
  it("detects audio and video sections", () => {
    expect(hasMediaSection(SAMPLE_SDP, "audio")).toBe(true);
    expect(hasMediaSection(SAMPLE_SDP, "video")).toBe(true);
  });

  it("returns false for missing kinds", () => {
    expect(hasMediaSection("v=0\n", "audio")).toBe(false);
    expect(hasMediaSection("v=0\n", "video")).toBe(false);
  });
});

describe("listCodecPayloadTypes", () => {
  it("returns payload-type / codec pairs for the given kind", () => {
    expect(listCodecPayloadTypes(SAMPLE_SDP, "video")).toEqual([
      { pt: "96", codec: "VP8" },
      { pt: "97", codec: "H264" },
      { pt: "98", codec: "AV1" },
    ]);
  });

  it("audio kind", () => {
    expect(listCodecPayloadTypes(SAMPLE_SDP, "audio")).toEqual([
      { pt: "111", codec: "opus" },
      { pt: "103", codec: "ISAC" },
      { pt: "9", codec: "G722" },
    ]);
  });

  it("returns empty when section is absent", () => {
    expect(listCodecPayloadTypes("v=0\n", "video")).toEqual([]);
  });
});
