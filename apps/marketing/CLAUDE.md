# CLAUDE.md

## Cloudflare Workers Deployment

This project is deployed to Cloudflare Workers via `@opennextjs/cloudflare`.

### Commands

```bash
pnpm deploy     # OpenNext build + deploy to Cloudflare
pnpm preview    # OpenNext build + run wrangler dev locally
```

### Known issues (resolved)

#### 1. `Dynamic require of "/.next/server/middleware-manifest.json" is not supported`

**Why it happens**: Next.js 16 loads `middleware-manifest.json` at runtime via a dynamic `require()` call inside `getMiddlewareManifest()`. Cloudflare Workers run in ES module mode, which does not support dynamic `require()` at runtime — only static `import` is allowed.

**Fix**: Set the env variable `NEXT_PRIVATE_MINIMAL_MODE=1` in `wrangler.jsonc` under `vars`. This flag tells Next.js to skip middleware manifest loading entirely. There is no downside here because this project does not use Next.js middleware.

#### 2. `ChunkLoadError: Failed to load chunk server/chunks/ssr/[root-of-the-server]__xxxxx._.js`

**Why it happens**: Next.js 16 uses Turbopack as the default bundler for production builds. Turbopack produces SSR chunks with a specific naming convention (`[root-of-the-server]__xxxxx._.js`) that `@opennextjs/cloudflare` does not inline into `handler.mjs` during its bundling step. Those chunks remain as separate files on disk, which the Worker cannot read at runtime — Cloudflare Workers have no filesystem.

**Fix**: Force Webpack for the production build. The `build` script in `package.json` uses `next build --webpack`. Do not change it back to `next build` alone without first verifying that OpenNext fully supports Turbopack production builds.

#### 3. Server-side env vars silently missing at runtime (dropped waitlist leads)

**Why it happens**: Next.js only inlines `NEXT_PUBLIC_*` env vars at build time. Any other
`process.env.X` read by server code (`ATTIO_API_KEY`) is resolved at *runtime*, and on Cloudflare
that means the Worker's own vars/secrets — not the build environment. Setting it in the GitHub
Actions `env:` block has no effect. This cost ~6 weeks of waitlist leads: `wrangler secret list`
returned `[]` while the server actions guarded with `if (token) { ... }`, so every submission
returned `{ success: true }` and was silently dropped.

**Fix**: set secrets on the Worker, once — they survive subsequent `wrangler deploy`s:

```bash
npx wrangler secret put ATTIO_API_KEY
```

Server code must never treat a missing secret as "feature disabled" on a lead-capture path —
`lib/attio.ts` throws instead, so the form errors visibly rather than losing the lead. Worker
observability is enabled in `wrangler.jsonc` so those throws are actually visible in the logs.

### Lead capture (Attio)

Waitlist and enterprise forms upsert a person in Attio by email and add them to a list. The list
ids live in `LISTS` in `lib/attio.ts` — they are the `collection/<uuid>` segment of the list URL
in the Attio app, not the `view/<uuid>` that follows it. Attio is the CRM of record; it is not an
email service provider, so launch emails go through a separate ESP.

### Push notifications (Telegram)

`captureLead()` pings a Telegram bot after the lead lands in Attio, so a notification always
means a recorded lead. Body is the email plus the list entry values; the notification links to
the Attio record via `web_url` from the upsert response. `lib/push.ts` holds it, and
`scripts/push-check.mjs` is its self-check (stubs `fetch`, no credentials needed).

Both credentials are Worker secrets, never `wrangler.jsonc` `vars`:

```bash
npx wrangler secret put TELEGRAM_BOT_TOKEN   # from @BotFather
npx wrangler secret put TELEGRAM_CHAT_ID     # from getUpdates, after messaging the bot
```

Messages go out as `parse_mode: HTML`, so lead data is escaped in `esc()` before it reaches
Telegram's parser — a company name containing `<` would otherwise 400 the send and lose the
notification. Never log the request URL: the bot token sits in the path.

**Rate limiting must be per credential, not per IP.** This ruled out ntfy.sh, whose free tier
limits on `basis: "ip"` (see `https://ntfy.sh/v1/tiers`) — in ntfy's `visitorID()` the bucket key
is the source IP unless the account is on a *paid* tier. A Worker egresses from a Cloudflare IP
shared with every other Worker, so the 250/day quota was spent by strangers and every publish
429'd. Telegram limits per bot token. This is also why a local `curl` test passes while
production fails: the Mac has its own IP with quota to spare, so test the Worker, not the laptop.

Unlike `ATTIO_API_KEY`, missing or failing push credentials are logged and skipped rather than
thrown: the lead is already recorded by then, so failing the request would trade a real lead for
a missed ping. Silence therefore isn't proof of no signups — check Worker logs, and Attio remains
the source of truth.

### Deployment file overview

- `wrangler.jsonc` — Worker config (bindings, compatibility flags, env vars)
- `open-next.config.ts` — OpenNext config (no R2 cache configured yet)
- `.open-next/` — build output directory (git-ignored)
- `.dev.vars` — local dev env variables for wrangler preview (git-ignored)
