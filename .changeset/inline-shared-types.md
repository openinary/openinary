---
"@openinary/core": patch
---

Inline the type-only definitions previously imported from the internal `shared` workspace package (`StorageConfig`, `StorageClientOptions`, `CacheEntry`, `CacheStats`, `CropMode`, `GravityMode`, `ImageFormat`, `VideoFormat`, `BackgroundColor`, `TransformParams`, `VideoTransformParams`, `ImageAnalysis`, `OptimizationResult`) into the package's own `src/types.ts`. `@openinary/core` no longer depends on `shared`, which only exists as a `workspace:*` link and can't be resolved outside this monorepo - this was blocking the package from being published standalone. No public API or type shape changes.
