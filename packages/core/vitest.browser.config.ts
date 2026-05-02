import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    include: ["test/browser/**/*.browser.test.ts"],
    browser: {
      enabled: true,
      provider: "playwright",
      headless: true,
      name: "chromium",
      providerOptions: {
        // Synthetic camera/mic so getUserMedia resolves with deterministic
        // frames + tones in CI. Without these, headless Chromium prompts
        // for permission and the test hangs.
        launch: {
          args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"],
        },
      },
    },
  },
});
