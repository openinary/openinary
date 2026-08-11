# web

The self-hosted Openinary dashboard: a Next.js 15 app for browsing media,
managing API keys and watching the video queue. It talks to `apps/api` over
HTTP and shares auth configuration with it through `packages/shared`, so both
read the same SQLite database.

Most of the interface comes from [`@openinary/ui`](../../packages/ui). Fix a
component there and it lands here and in the Cloud dashboard at once.

## Develop

From the repo root, which starts the API on 3000 and this app on 3001:

```bash
pnpm dev
```

Or this app alone, assuming an API is already running:

```bash
pnpm dev:web
```

Then open <http://localhost:3001>. Port 3000 is the API, not the dashboard.

On a fresh database the app redirects to `/setup` to create the first admin
account. See [Local Development](https://docs.openinary.dev/local-development)
for the full setup.

## Layout

```bash
src/app/
├── (dashboard)/      # Protected routes: media browser, API keys, queue inspector
├── login/
├── setup/            # First-run admin account creation
├── uploader-demo/    # File uploader playground
└── api/
    ├── auth/         # Better Auth handler
    ├── check-setup/  # Whether first-run setup is still pending
    ├── upload-token/ # Mints presigned upload signatures for the demo
    └── version/      # Running version, used by the update banner
```

## Environment

The dashboard needs `NEXT_PUBLIC_API_BASE_URL` and the auth variables it shares
with the API. In the bundled `full` Docker image that base URL is baked in as
`/api`, since nginx proxies the API under that path. See
[Server Configuration](https://docs.openinary.dev/configuration/server).
