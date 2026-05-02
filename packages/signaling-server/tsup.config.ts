import { defineConfig } from "tsup";
import { createBanner } from "../../tools/build-banner.ts";

export default defineConfig({
  entry: ["src/index.ts", "src/cli.ts"],
  format: ["esm"],
  dts: true,
  sourcemap: true,
  clean: true,
  target: "node20",
  platform: "node",
  treeshake: true,
  external: [
    "ws",
    "commander",
    "picocolors",
    "@forinda/video-sdk-signaling-adapter-ws",
    "@forinda/video-sdk-signaling-protocol",
  ],
  tsconfig: "./tsconfig.build.json",
  banner: { js: createBanner() },
});
