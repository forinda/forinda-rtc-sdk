import { defineConfig } from "tsup";
import { createBanner } from "../../tools/build-banner.ts";

export default defineConfig({
  entry: ["src/index.ts", "src/manual.ts"],
  format: ["esm", "iife"],
  globalName: "ForindaVideoSdk",
  dts: true,
  sourcemap: true,
  clean: true,
  target: "es2022",
  treeshake: true,
  tsconfig: "./tsconfig.build.json",
  external: ["@forinda/video-sdk-core", "@forinda/video-sdk-signaling-ws"],
  banner: { js: createBanner() },
});
