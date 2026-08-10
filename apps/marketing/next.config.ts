import type { NextConfig } from "next";
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";

const nextConfig: NextConfig = {
  images: {
    // Optimized images (/_next/image) had no Cache-Control header on Cloudflare
    minimumCacheTTL: 31536000,
  },
  // PostHog reverse proxy — the site's own worker proxies /ingest/* to PostHog EU
  // so ad blockers don't see posthog.com domains
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
  // PostHog API calls use trailing slashes; without this Next redirects them
  skipTrailingSlashRedirect: true,
};

export default nextConfig;

initOpenNextCloudflareForDev();
