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
  minify: true,
  external: ["react", "react-dom", "@forinda/video-sdk-core"],
  tsconfig: "./tsconfig.build.json",
  banner: { js: createBanner() },
});
