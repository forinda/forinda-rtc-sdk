import { describe, expect, it } from "vitest";
import { ConfigurationError } from "@/errors/errors.ts";
import { normalizeIceServers, type IceServerConfig } from "@/peer/ice.ts";

describe("normalizeIceServers", () => {
  it("returns an empty array when input is empty", () => {
    expect(normalizeIceServers([])).toEqual([]);
  });

  it("forwards a fully-specified server unchanged", () => {
    const input: IceServerConfig[] = [
      { urls: "stun:stun.l.google.com:19302" },
      { urls: ["turn:turn.example.com:3478"], username: "u", credential: "p" },
    ];
    const result = normalizeIceServers(input);
    expect(result).toHaveLength(2);
    expect(result[0]?.urls).toBe("stun:stun.l.google.com:19302");
    expect(result[1]?.username).toBe("u");
  });

  it("accepts a single string shorthand", () => {
    const result = normalizeIceServers(["stun:stun.l.google.com:19302"]);
    expect(result).toEqual([{ urls: "stun:stun.l.google.com:19302" }]);
  });

  it("accepts an array of strings shorthand", () => {
    const result = normalizeIceServers([
      ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"],
    ]);
    expect(result).toEqual([
      { urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] },
    ]);
  });

  it("rejects URLs without a known scheme", () => {
    expect(() => normalizeIceServers(["http://stun.example.com"])).toThrow(ConfigurationError);
  });

  it("accepts stun:, stuns:, turn:, turns: schemes", () => {
    const ok = normalizeIceServers(["stun:a", "stuns:b", "turn:c", "turns:d"]);
    expect(ok).toHaveLength(4);
  });

  it("rejects TURN servers missing credentials", () => {
    expect(() => normalizeIceServers([{ urls: "turn:turn.example.com" }])).toThrow(
      ConfigurationError,
    );
  });

  it("accepts TURN with username + credential", () => {
    expect(() =>
      normalizeIceServers([{ urls: "turn:turn.example.com", username: "u", credential: "p" }]),
    ).not.toThrow();
  });
});
