# @openinary registry

The shadcn/ui registry for Openinary components. Source lives here; the built
JSON in [`/r`](../../r) is published to `https://openinary.dev/r/{name}.json`.

## Items

| Item                       | Type            | Installs to                        |
| -------------------------- | --------------- | ---------------------------------- |
| `@openinary/file-uploader` | registry:block  | `components/openinary/` + hook      |
| `@openinary/upload-token`  | registry:lib    | `lib/upload-token.ts` (server)      |

## Consumer usage

Add the namespace to `components.json`, then install:

```json
{
  "registries": {
    "@openinary": "https://openinary.dev/r/{name}.json"
  }
}
```

```bash
pnpm dlx shadcn@latest add @openinary/file-uploader
pnpm dlx shadcn@latest add @openinary/upload-token
```

Full guide: <https://openinary.dev/docs/guides/file-uploader>

## Development

```bash
pnpm --filter registry type-check    # type-check the source (uses local stubs)
pnpm --filter registry registry:build # rebuild ../../r from registry.json
```

- `src/file-uploader/` — the component (`file-uploader.tsx`) and upload engine
  hook (`use-file-upload.ts`). Imports use consumer aliases (`@/components/ui/*`,
  `@/lib/utils`) that the shadcn CLI rewrites on install.
- `src/upload-token/upload-token.ts` — thin client for `POST /upload/sign`
  (`apps/api/src/routes/upload.ts`). It does not compute any signature itself —
  Openinary does, via `apps/api/src/utils/upload-signature.ts` — so there is
  nothing to keep byte-compatible here.
- `src/stubs/` — type-check-only stand-ins for the consumer's shadcn components;
  **not** part of the registry output.

After changing any source file, rebuild and commit `/r` — CI fails if it is stale.
