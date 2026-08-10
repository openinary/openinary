import { withEnvStyles } from "env.style";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // PostHog reverse proxy, same three rewrites the marketing site already
  // runs: ingestion leaves on our own domain, so an ad blocker never sees a
  // posthog.com request. Unproxied, app.openinary.dev was losing roughly one
  // signup in ten to blocked clients - and with it every $exception and the
  // whole playground funnel, which only exist client-side.
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
};

export default withEnvStyles(nextConfig, {
  color: {
    development: "#3b82f6",
    preview: "#f59e0b",
    staging: "#6b7280",
  },
});
