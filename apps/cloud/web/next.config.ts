import { withEnvStyles } from "env.style";
import type { NextConfig } from "next";
import { PHASE_DEVELOPMENT_SERVER } from "next/constants";

const config = (dev: boolean): NextConfig => ({
  // Ships TypeScript source only.
  transpilePackages: ["@openinary/dashboard"],
  // The dashboard asserts NEXT_PUBLIC_SERVER_URL non-null, and .env.production
  // is gitignored, so a fresh clone needs a default to build at all. Builds
  // default to production (as apps/cloud/admin does), `next dev` to the local
  // server, so a dev session never talks to production by accident. .env files
  // still win.
  env: {
    NEXT_PUBLIC_SERVER_URL:
      process.env.NEXT_PUBLIC_SERVER_URL ??
      (dev ? "http://localhost:3100" : "https://cdn.openinary.dev"),
  },
  // PostHog reverse proxy, same three rewrites the marketing site already
  // runs: ingestion leaves on our own domain, so an ad blocker never sees a
  // posthog.com request. Unproxied, app.openinary.dev was losing roughly one
  // signup in ten to blocked clients - and with it every $exception and the
  // whole playground funnel, which only exist client-side.
  // Settings used to be a dialog opened by ?settings=<tab>. Those links are in
  // sent emails and in the API's planUrl, so they keep working.
  async redirects() {
    return [
      {
        source: "/",
        has: [{ type: "query", key: "settings", value: "(?<tab>[a-z-]+)" }],
        destination: "/settings/:tab",
        permanent: false,
      },
      // Plan and Usage became Usage & billing and Logs. Links already out in
      // emails and quota errors still say ?settings=plan.
      { source: "/settings/plan", destination: "/settings/billing", permanent: false },
      { source: "/settings/activity", destination: "/settings/logs", permanent: false },
    ];
  },
  async rewrites() {
    return [
      {
        source: "/ingest/static/:path*",
        destination: "https://eu-assets.i.posthog.com/static/:path*",
      },
      {
        source: "/ingest/array/:path*",
        destination: "https://eu-assets.i.posthog.com/array/:path*",
      },
      {
        source: "/ingest/:path*",
        destination: "https://eu.i.posthog.com/:path*",
      },
    ];
  },
  // PostHog's API calls use trailing slashes; without this Next redirects
  // them and the events never arrive.
  skipTrailingSlashRedirect: true,
});

// withEnvStyles takes the phase function itself: outside production it
// returns a function of its own, and Next does not unwrap two.
export default withEnvStyles(
  (phase: string) => config(phase === PHASE_DEVELOPMENT_SERVER),
  {
    color: {
      development: "#3b82f6",
      preview: "#f59e0b",
      staging: "#6b7280",
    },
  },
);
