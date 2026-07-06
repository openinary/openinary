import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    index: "src/index.ts",
    create: "src/create.ts",
  },
  format: ["esm"],
  target: "node20",
  platform: "node",
  banner: { js: "#!/usr/bin/env node" },
  splitting: false,
  clean: true,
  sourcemap: true,
  minify: false,
  dts: false,
});
