import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
    // Cross-package suites do real network + WebRTC; bump the per-test
    // timeout above the default 5s so flaky CI doesn't false-positive.
    testTimeout: 15_000,
    hookTimeout: 15_000,
  },
});
