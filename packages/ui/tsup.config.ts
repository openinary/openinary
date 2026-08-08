import { defineConfig, type Options } from "tsup";

const common: Options = {
  format: ["esm"],
  target: "es2022",
  dts: true,
  sourcemap: true,
  treeshake: true,
  // Code-splitting would hoist shared modules into a chunk the banner
  // never touches, silently dropping the "use client" boundary.
  splitting: false,
  external: ["react", "react-dom", "@tanstack/react-query", "sonner"],
  esbuildOptions(o) {
    o.jsx = "automatic";
  },
};

// tsup runs every entry in this array concurrently against the same dist/
// output dir. `clean` on any one of them is a race against the others'
// writes — it wiped dist/server.d.ts intermittently when index's clean
// fired after server had already written its output. Cleaning is done as
// a separate deterministic step in package.json's build script instead.
export default defineConfig([
  {
    ...common,
    entry: { index: "src/index.ts" },
    // banner: { js } is silently dropped by esbuild's bundler when it
    // detects directive-shaped text — see scripts/add-use-client-banner.mjs.
    // onSuccess (not a package.json postbuild step) so the banner is also
    // re-stamped after every `tsup --watch` rebuild; a watch rebuild
    // without it ships a dist that breaks Next.js client boundaries.
    onSuccess: "node scripts/add-use-client-banner.mjs",
  },
  {
    ...common,
    entry: { server: "src/server.ts" },
  },
]);
