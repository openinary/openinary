# CLAUDE.md

## Cloudflare Workers Deployment

This project is deployed to Cloudflare Workers via `@opennextjs/cloudflare`.

### Commands

```bash
pnpm deploy     # OpenNext build + deploy to Cloudflare
pnpm preview    # OpenNext build + run wrangler dev locally
pnpm test       # pricing-check: the homepage cost comparison maths
```

`prebuild` builds `@openinary/plans` (the Cloud plan catalog the pricing copy
and calculator read) and syncs the registry uploader, so a plain `pnpm deploy`
from this folder never ships a stale catalog.

### Known issues (resolved)

#### 1. `Dynamic require of "/.next/server/middleware-manifest.json" is not supported`

**Why it happens**: Next.js 16 loads `middleware-manifest.json` at runtime via a dynamic `require()` call inside `getMiddlewareManifest()`. Cloudflare Workers run in ES module mode, which does not support dynamic `require()` at runtime, only static `import`.

**Fix**: Set the env variable `NEXT_PRIVATE_MINIMAL_MODE=1` in `wrangler.jsonc` under `vars`. This flag tells Next.js to skip middleware manifest loading entirely. There is no downside here because this project does not use Next.js middleware.

#### 2. `ChunkLoadError: Failed to load chunk server/chunks/ssr/[root-of-the-server]__xxxxx._.js`

**Why it happens**: Next.js 16 uses Turbopack as the default bundler for production builds. Turbopack produces SSR chunks with a specific naming convention (`[root-of-the-server]__xxxxx._.js`) that `@opennextjs/cloudflare` does not inline into `handler.mjs` during its bundling step. Those chunks remain as separate files on disk, which the Worker cannot read at runtime: Cloudflare Workers have no filesystem.

**Fix**: Force Webpack for the production build. The `build` script in `package.json` uses `next build --webpack`. Do not change it back to `next build` alone without first verifying that OpenNext fully supports Turbopack production builds.

#### 3. Server-side env vars silently missing at runtime

**Why it happens**: Next.js only inlines `NEXT_PUBLIC_*` env vars at build time. Any other
`process.env.X` read by server code is resolved at *runtime*, and on Cloudflare that means the
Worker's own vars/secrets, not the build environment. Setting it in the GitHub Actions `env:`
block has no effect. This once cost ~6 weeks of waitlist leads (the lead-capture path has since
been removed): `wrangler secret list` returned `[]` while the server code guarded with
`if (token) { ... }`, so every submission reported success and was silently dropped.

**Fix**: set secrets on the Worker, once; they survive subsequent `wrangler deploy`s
(`npx wrangler secret put NAME`). Server code must never treat a missing secret as "feature
disabled" on a path that records data: throw instead, so it fails visibly. Worker observability
is enabled in `wrangler.jsonc` so those throws show up in the logs.

#### 4. Rate limits keyed on IP fail from a Worker

A Worker egresses from Cloudflare IPs shared with every other Worker, so any third-party API
that rate-limits per IP (ntfy.sh's free tier, GitHub's unauthenticated API) has its quota spent
by strangers. A local `curl` passes because the Mac has its own IP: test the Worker, not the
laptop. This is why the header's GitHub star count is fetched from the visitor's browser
(`hooks/use-github-stars.ts`) rather than server-side: with no incremental cache configured, a
server fetch would run on every render.

### Deployment file overview

- `wrangler.jsonc`: Worker config (bindings, compatibility flags, env vars)
- `open-next.config.ts`: OpenNext config (no incremental cache configured yet)
- `.open-next/`: build output directory (git-ignored)
- `.dev.vars`: local dev env variables for wrangler preview (git-ignored)
