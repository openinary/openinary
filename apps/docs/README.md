# Openinary docs

The documentation at [openinary.dev/docs](https://openinary.dev/docs), built with
[Nimbus](https://nimbus-docs.com) (Astro) and served by the `docs` Worker. Writing
rules: `.cursor/rules/project_rules.mdc`.

```bash
pnpm dev:docs            # from the repo root, http://localhost:3333/docs
pnpm --filter docs build
pnpm --filter docs serve # production build on :3335, what the marketing dev server shows at /docs
```

To click between the marketing site and the docs on one origin, as in
production, run the marketing dev server (:3211) and `serve`: in dev, the
marketing app forwards /docs to :3335 (app/docs/[[...path]]/route.ts there).

## Layout

| Path | URL |
| --- | --- |
| `src/content/docs/` | `/docs/…` |
| `src/content/reference/` | `/docs/api-reference/…` |

`changelog.mdx` sits outside the site: openinary.dev/changelog renders it, and
`/docs/changelog` redirects there. The sidebar order is set by hand in `astro.config.ts`. The pages came from
Mintlify and keep its component names, mapped in `src/components.ts`.

## Deploy

Manual, like the marketing site:

```bash
pnpm deploy:docs
```

The Worker answers on the route `openinary.dev/docs*`. The marketing Worker owns
`openinary.dev` as a custom domain, and a route on the same hostname takes
precedence, so each Worker keeps its own paths. Pages are prerendered; only
`/docs/mcp` (the MCP server) runs on request. PostHog sends to `/ingest`, the
marketing Worker's proxy on the same origin.

## Cut-over from docs.openinary.dev (Mintlify)

1. Deploy this Worker and check `https://openinary.dev/docs`.
2. In Cloudflare DNS, replace the `docs` CNAME to `cname.mintlify-dns.com` with a
   proxied `AAAA docs 100::` record.
3. Add two Single Redirect rules on `docs.openinary.dev`, in this order, both 301
   and keeping the query string:
   - `https://docs.openinary.dev/*.md` to `https://openinary.dev/docs/${1}/index.md`
   - `https://docs.openinary.dev/*` to `https://openinary.dev/docs/${1}`

   `api-reference/introduction` moved to `api-reference`; `public/_redirects`
   covers its old URL.
4. Remove the GitHub integration in the Mintlify dashboard, then cancel the plan.
