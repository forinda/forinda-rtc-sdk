import { defineConfig } from "tsup";
import { createBanner } from "../../tools/build-banner.ts";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  dts: true,
  sourcemap: true,
  clean: true,
  target: "es2022",
  treeshake: true,
  tsconfig: "./tsconfig.build.json",
  external: [
    "@forinda/video-sdk-core",
    "@forinda/video-sdk-signaling-protocol",
    "@forinda/video-sdk-signaling-server",
    "vitest",
  ],
  banner: { js: createBanner() },
});
