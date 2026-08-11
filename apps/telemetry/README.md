# openinary-telemetry

Cloudflare Worker that receives anonymous usage pings from self-hosted
[Openinary](https://github.com/openinary/openinary) instances, validates them
against a strict whitelist, rate-limits per instance and per IP, then
forwards accepted events to PostHog.

This repo is private: the public Openinary codebase only knows the public
`/collect` endpoint URL, never the PostHog project key or the rate-limit
thresholds. What Openinary instances send is documented publicly in
[`docs/configuration/telemetry.mdx`](https://github.com/openinary/openinary/blob/main/docs/configuration/telemetry.mdx)
in the main repo — keep the event schema in `src/index.ts` in sync with
`apps/api/src/utils/telemetry.ts` over there.

## Develop

```bash
npm install
npx wrangler dev
```

## Deploy

```bash
npx wrangler secret put POSTHOG_API_KEY   # once, or when rotating
npx wrangler deploy
```

Then point the `telemetry.openinary.dev` custom domain at this Worker from
the Cloudflare dashboard.
