# openinary-telemetry

Cloudflare Worker that receives anonymous usage pings from self-hosted
[Openinary](https://github.com/openinary/openinary) instances, validates them
against a strict whitelist, rate-limits per instance and per IP, then
forwards accepted events to PostHog.

This Worker lives in the public Openinary monorepo. The only secret is the
PostHog project key, held as a Wrangler secret and never committed. Everything
else, including the rate-limit thresholds in `wrangler.jsonc`, is public by
design: the whitelist is the contract, and it is worth more reviewed than
hidden.

What Openinary instances send is documented in
[`apps/docs/configuration/telemetry.mdx`](https://github.com/openinary/openinary/blob/main/apps/docs/configuration/telemetry.mdx).
Keep the event schema in `src/index.ts` in sync with
[`apps/api/src/utils/telemetry.ts`](https://github.com/openinary/openinary/blob/main/apps/api/src/utils/telemetry.ts):
a property the instance sends and this whitelist does not accept is dropped
silently.

## Develop

From the repo root:

```bash
pnpm install
pnpm dev:telemetry
```

## Deploy

```bash
npx wrangler secret put POSTHOG_API_KEY   # once, or when rotating
npx wrangler deploy
```

Then point the `telemetry.openinary.dev` custom domain at this Worker from
the Cloudflare dashboard.
