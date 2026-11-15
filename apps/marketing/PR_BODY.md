Fixes from the geo.new audit of https://openinary.dev (64/100). All changes are in `apps/marketing`.

## What changes

- **Metadata**: `metadataBase` on `https://openinary.dev`, Open Graph and Twitter card tags, a 1200x630 `og.png` cropped from `product/preview.png`, a canonical on every route, meta description trimmed from 173 to 136 characters, em dashes removed from the compare page titles.
- **JSON-LD** on the homepage: `Organization` (logo, sameAs, support ContactPoint), `WebSite`, `SoftwareApplication` with the free plan `Offer` (quotas read from `data/pricing.json`), `FAQPage` built from the FAQ array.
- **Headings**: one H1 instead of five. Docs cards are now h3, the "Why Openinary" and "Questions" eyebrows are h2, and FAQ questions are h3 inside `<summary>`. Rendering is unchanged.
- **Crawl files**: `app/sitemap.ts` and `app/robots.ts`.
- **Security headers** via `next.config.ts` `headers()` (HSTS, nosniff, X-Frame-Options, Referrer-Policy, Permissions-Policy), because `public/_headers` only applies to static assets, not Worker-rendered HTML. `poweredByHeader: false`. No CSP for now: Next's inline scripts would need nonces.
- **llms.txt**: Cloud is described as a live public alpha with its free plan instead of "in development"; em dashes and the "leading alternative" claim removed.
- **Small fixes**: skip link, eager loading for the hero storage logos, GitHub and Contact (support@openinary.dev) links in the footer.

## Skipped on purpose

Adding a figure to every section (copy rewrite for a scorer), the label/button-name warnings (false positives: fields are labelled via `<label for>`), srcset (only small SVG logos), script count (Next chunks), domain authority (outreach, not code).

## Outside this PR

- Cloudflare Redirect Rule: `www.openinary.dev/*` to `https://openinary.dev/$1` (301). Both hosts serve the site today.
- Deploy is manual: `cd apps/marketing && pnpm run deploy`.

## Verification

- `pnpm build` and `pnpm lint` pass.
- Local check: a single H1, the JSON-LD parses with 4 nodes, og/twitter/canonical tags present, the 5 security headers are sent, `/sitemap.xml` and `/robots.txt` respond, no em or en dashes in the HTML or in llms.txt.
