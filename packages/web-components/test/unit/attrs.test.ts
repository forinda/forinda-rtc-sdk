import { beforeEach, describe, expect, it } from "vitest";
import { readBoolean, readJson, readNumber, readString } from "@/internal/attrs.ts";

describe("attrs", () => {
  let el: HTMLElement;

  beforeEach(() => {
    el = document.createElement("div");
  });

  describe("readString", () => {
    it("returns the attribute value when present", () => {
      el.setAttribute("name", "alice");
      expect(readString(el, "name", "default")).toBe("alice");
    });

    it("returns the fallback when absent", () => {
      expect(readString(el, "name", "default")).toBe("default");
    });

    it("returns null when absent and no fallback", () => {
      expect(readString(el, "name")).toBeNull();
    });

    it("returns empty string when attribute is set to empty value", () => {
      el.setAttribute("name", "");
      expect(readString(el, "name", "default")).toBe("");
    });
  });

  describe("readBoolean", () => {
    it("returns true when attribute is present", () => {
      el.setAttribute("muted", "");
      expect(readBoolean(el, "muted")).toBe(true);
    });

    it("returns true when attribute is present with value", () => {
      el.setAttribute("muted", "true");
      expect(readBoolean(el, "muted")).toBe(true);
    });

    it("returns false when attribute is absent", () => {
      expect(readBoolean(el, "muted")).toBe(false);
    });
  });

  describe("readNumber", () => {
    it("parses numeric attributes", () => {
      el.setAttribute("interval", "1500");
      expect(readNumber(el, "interval", 1000)).toBe(1500);
    });

    it("returns fallback when attribute is absent", () => {
      expect(readNumber(el, "interval", 1000)).toBe(1000);
    });

    it("returns fallback when value is not a number", () => {
      el.setAttribute("interval", "not-a-number");
      expect(readNumber(el, "interval", 1000)).toBe(1000);
    });

    it("returns fallback when value is Infinity", () => {
      el.setAttribute("interval", "Infinity");
      expect(readNumber(el, "interval", 1000)).toBe(1000);
    });

    it("parses negative and float values", () => {
      el.setAttribute("offset", "-2.5");
      expect(readNumber(el, "offset", 0)).toBe(-2.5);
    });
  });

  describe("readJson", () => {
    it("parses valid JSON arrays", () => {
      el.setAttribute("ice", '[{"urls":"stun:stun.example"}]');
      expect(readJson(el, "ice", [])).toEqual([{ urls: "stun:stun.example" }]);
    });

    it("returns fallback for invalid JSON", () => {
      el.setAttribute("ice", "not-json");
      const fallback = [{ urls: "stun:default" }];
      expect(readJson(el, "ice", fallback)).toBe(fallback);
    });

    it("returns fallback when attribute is absent", () => {
      const fallback = [{ urls: "stun:default" }];
      expect(readJson(el, "ice", fallback)).toBe(fallback);
    });
  });
});
