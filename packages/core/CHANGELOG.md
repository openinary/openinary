# @openinary/core

## 1.1.1

### Patch Changes

- Fix `f_auto` producing an invalid `image/auto` Content-Type header, which caused browsers to download the image instead of rendering it inline. `optimizeForDelivery` was treating `params.format === "auto"` as an explicit format request instead of triggering format auto-detection; it now falls through to the existing format size-comparison logic and resolves to a real format (avif/webp/jpeg/png).

## 1.1.0

### Minor Changes

- bb1d35c: Extract the transform engine and route factories out of `apps/api` into a standalone, publishable package: `TransformService`, the video job queue (`VideoJobQueue` / `VideoJobStore`, with a SQLite implementation), the storage layer (`CloudStorage`, `createStorageClient`), image/video processing, and the Hono route factories that don't depend on the self-hosted auth model. Each route factory takes a `RouteDeps` object (`{ storage, queue }`) instead of resolving its own dependencies, so a consumer can mount them with its own storage/queue/auth setup.

### Patch Changes

- 340e6c7: Inline the type-only definitions previously imported from the internal `shared` workspace package (`StorageConfig`, `StorageClientOptions`, `CacheEntry`, `CacheStats`, `CropMode`, `GravityMode`, `ImageFormat`, `VideoFormat`, `BackgroundColor`, `TransformParams`, `VideoTransformParams`, `ImageAnalysis`, `OptimizationResult`) into the package's own `src/types.ts`. `@openinary/core` no longer depends on `shared`, which only exists as a `workspace:*` link and can't be resolved outside this monorepo - this was blocking the package from being published standalone. No public API or type shape changes.
- 4c3e530: Make the package actually publishable: point `main`/`types`/the `exports` map at the compiled `dist` output instead of `src` (the previous config worked inside the monorepo via the workspace symlink, but would break type resolution for anyone installing the package from npm, since `src` isn't shipped), add `license` (AGPL-3.0-only, matching the rest of the repo), `description`, `repository`, `publishConfig.access: "public"` (required for a scoped package to publish without a paid npm org), a `files` allowlist so only `dist` ships, and a `prepublishOnly` build safety net. Also adds `dependsOn: ["^build"]` to the repo's `type-check`/`test` turbo tasks so dependents always type-check against a freshly built `@openinary/core`, matching what `build`/`dev`/`start` already did.
