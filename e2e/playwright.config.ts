import { defineConfig } from "@playwright/test";

const SIGNALING_PORT = 8787;
const VITE_PORT = 5174;

export default defineConfig({
  testDir: "./tests",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  use: {
    baseURL: `http://127.0.0.1:${VITE_PORT}`,
    headless: true,
    launchOptions: {
      args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"],
    },
  },
  webServer: [
    {
      command: "pnpm --filter dev-signaling-server start",
      port: SIGNALING_PORT,
      reuseExistingServer: !process.env.CI,
      timeout: 30_000,
    },
    {
      command: "pnpm --filter example-react-publisher-viewer dev",
      port: VITE_PORT,
      reuseExistingServer: !process.env.CI,
      timeout: 30_000,
    },
  ],
  projects: [{ name: "chromium", use: { browserName: "chromium" } }],
});
