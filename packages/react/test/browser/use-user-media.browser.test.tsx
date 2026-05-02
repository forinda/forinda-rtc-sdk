import { renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useUserMedia } from "@/use-user-media.ts";

describe("useUserMedia in real Chromium (EPIC-8)", () => {
  it("transitions to granted with a real video track", async () => {
    const { result } = renderHook(() => useUserMedia({ video: true }));
    await waitFor(() => expect(result.current.state).toBe("granted"));
    expect(result.current.stream?.getVideoTracks().length).toBe(1);
    result.current.stop();
  });
});
