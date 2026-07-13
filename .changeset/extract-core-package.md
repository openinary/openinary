---
"@openinary/core": minor
---

Extract the transform engine and route factories out of `apps/api` into a standalone, publishable package: `TransformService`, the video job queue (`VideoJobQueue` / `VideoJobStore`, with a SQLite implementation), the storage layer (`CloudStorage`, `createStorageClient`), image/video processing, and the Hono route factories that don't depend on the self-hosted auth model. Each route factory takes a `RouteDeps` object (`{ storage, queue }`) instead of resolving its own dependencies, so a consumer can mount them with its own storage/queue/auth setup.
