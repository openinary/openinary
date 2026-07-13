---
"@openinary/core": patch
---

Make the package actually publishable: point `main`/`types`/the `exports` map at the compiled `dist` output instead of `src` (the previous config worked inside the monorepo via the workspace symlink, but would break type resolution for anyone installing the package from npm, since `src` isn't shipped), add `license` (AGPL-3.0-only, matching the rest of the repo), `description`, `repository`, `publishConfig.access: "public"` (required for a scoped package to publish without a paid npm org), a `files` allowlist so only `dist` ships, and a `prepublishOnly` build safety net. Also adds `dependsOn: ["^build"]` to the repo's `type-check`/`test` turbo tasks so dependents always type-check against a freshly built `@openinary/core`, matching what `build`/`dev`/`start` already did.
