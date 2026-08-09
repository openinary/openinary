# @openinary/core

## 1.6.0

### Minor Changes

- 496da21: Audio (`wav`, `mp3`, `ogg`) and 3D (`glb`, `gltf`) uploads are accepted, stored and delivered as untouched originals. A bare `/t/<path>` URL now streams the stored original for any type with its real content-type; images keep their automatic format optimization. The upload whitelist and the extension to content-type map derive from a single media-type table so they cannot drift.

### Patch Changes

- dab1579: Uploads are checked against the file's own bytes (magic signatures per accepted type), so a payload renamed to an allowed extension is rejected at upload. Every delivery response, including the authenticated route, carries `X-Content-Type-Options: nosniff` and labels stored originals from the shared media-type table.

### Patch Changes

- 27430aa: Storage: only a real 404 marks an object as missing — transient S3 errors (timeouts, throttling, cold-start TLS resets) are no longer cached as "file not found" for the negative-cache TTL. Video resize: a single dimension is enough (`w_303` alone works), `setsar=1` on every branch so non-square-SAR sources display at the requested shape, dimensions rounded to even numbers for h264.

## 1.5.0

### Minor Changes

- 6c6bd81: Keep characters that break a URL out of storage keys.

  Every asset is fetched through a URL built from its key, so a key holding a
  `#` or a `?` can never be delivered: the browser strips the fragment or query
  before the request leaves, and a video uploaded as `The #1 clip.mp4` is asked
  for as `The ` and 404s on a file that is sitting right there. A literal `%` is
  worse than truncation - readers decode, so `50%20off.mp4` is looked up as
  `50 off.mp4`.

  New `stripUrlHostile` export, applied on the way into storage: the upload and
  create-folder routes, plus rename and move. Spaces and accents are untouched;
  they encode and decode cleanly and always did.

  This only guards new writes. Assets already stored with one of these
  characters stay unreachable through a naively built URL until they are
  renamed.

## 1.4.1

### Patch Changes

- Probe a remote source with GET, not HEAD

  A presigned URL authorizes exactly one method — SigV4 signs the verb into the
  string it signs — so a URL issued for GET answers 403 to a HEAD. The existence
  check introduced in 1.4.0 used HEAD, which reported every object that exists as
  missing and meant no transform against a remote source ever ran.

  It now asks for one byte over GET (`Range: bytes=0-0`). An absent key still
  answers 404, so nothing is lost by asking this way.

## 1.4.0

### Minor Changes

- 8125c4b: Read a transform's source from a caller-supplied URL

  An instance can now be told to fetch one original from a signed URL instead of
  its own storage, via an `X-Openinary-Source-Url` request header on `/t/*`. It
  exists for deployments where the originals belong to the end user: a control
  plane holding the user's storage credentials can hand out a short-lived URL for
  a single object rather than distributing the credentials themselves.

  Off unless `ALLOW_REMOTE_SOURCE=true`, and that gate is deliberate. `/t/*` is a
  public route, so honouring an arbitrary URL from a request header would make a
  reachable instance a fetch proxy for whatever it can address — enable it only
  where the transform route is not publicly reachable and every caller is
  trusted. https only, and the URL is HEADed before use so an expired signature
  reads as "not found" rather than surfacing later as a truncated download inside
  sharp.

  Covers images and video thumbnails. A full video transcode goes through the
  background job queue, which downloads its own copy when it picks the job up —
  possibly long after any signed URL has expired — so that path still reads from
  the instance's own storage.

  Nothing changes for instances that don't set the flag, and the cache is
  untouched either way: only where the source bytes come from.

### Patch Changes

- ed6ebe8: Stop emitting Content-Length twice, and write cache entries atomically

  Both had been carried as downstream patches against the published package
  rather than fixed here, so every consumer that upgraded silently lost them.

  `/t/*` passed the transform result's own `Content-Length` through to Hono,
  which then wrote its own from the body it was handed. Two `Content-Length`
  headers is a framing error (RFC 9110 8.6): undici rejects the response
  outright, and a caller proxying this instance over `fetch` can be left
  awaiting a response that never settles, with no status to report.

  It is now dropped for a buffered body and kept for a streamed one, because
  `@hono/node-server` writes its own header only when it can measure the body.
  Dropping it in both cases would leave a bare `/t/<video>` streaming the
  original as `Transfer-Encoding: chunked` with no length for the player.

  `saveToCache` wrote in place, so a concurrent `existsInCache`/`readFromCache`
  could observe a half-written entry and hand back a truncated image. It now
  writes a temp file and renames, which is atomic.

## 1.1.1

### Patch Changes

- Fix `f_auto` producing an invalid `image/auto` Content-Type header, which caused browsers to download the image instead of rendering it inline. `optimizeForDelivery` was treating `params.format === "auto"` as an explicit format request instead of triggering format auto-detection; it now falls through to the existing format size-comparison logic and resolves to a real format (avif/webp/jpeg/png).

## 1.1.0

### Minor Changes

- bb1d35c: Extract the transform engine and route factories out of `apps/api` into a standalone, publishable package: `TransformService`, the video job queue (`VideoJobQueue` / `VideoJobStore`, with a SQLite implementation), the storage layer (`CloudStorage`, `createStorageClient`), image/video processing, and the Hono route factories that don't depend on the self-hosted auth model. Each route factory takes a `RouteDeps` object (`{ storage, queue }`) instead of resolving its own dependencies, so a consumer can mount them with its own storage/queue/auth setup.

### Patch Changes

- 340e6c7: Inline the type-only definitions previously imported from the internal `shared` workspace package (`StorageConfig`, `StorageClientOptions`, `CacheEntry`, `CacheStats`, `CropMode`, `GravityMode`, `ImageFormat`, `VideoFormat`, `BackgroundColor`, `TransformParams`, `VideoTransformParams`, `ImageAnalysis`, `OptimizationResult`) into the package's own `src/types.ts`. `@openinary/core` no longer depends on `shared`, which only exists as a `workspace:*` link and can't be resolved outside this monorepo - this was blocking the package from being published standalone. No public API or type shape changes.
- 4c3e530: Make the package actually publishable: point `main`/`types`/the `exports` map at the compiled `dist` output instead of `src` (the previous config worked inside the monorepo via the workspace symlink, but would break type resolution for anyone installing the package from npm, since `src` isn't shipped), add `license` (AGPL-3.0-only, matching the rest of the repo), `description`, `repository`, `publishConfig.access: "public"` (required for a scoped package to publish without a paid npm org), a `files` allowlist so only `dist` ships, and a `prepublishOnly` build safety net. Also adds `dependsOn: ["^build"]` to the repo's `type-check`/`test` turbo tasks so dependents always type-check against a freshly built `@openinary/core`, matching what `build`/`dev`/`start` already did.
