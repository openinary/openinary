import type { NextConfig } from "next";
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  images: {
    // Optimized images (/_next/image) had no Cache-Control header on Cloudflare
    minimumCacheTTL: 31536000,
    // Next only serves qualities on this list and 400s the rest, so anything
    // an <Image quality> asks for has to be declared here. 75 is the default
    // the rest of the site relies on; 88 is for UI shots, where text smears
    // at 75.
    qualities: [75, 88],
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
  // public/_headers only reaches static assets; Worker-rendered HTML gets these.
  // ponytail: no Content-Security-Policy, Next's inline scripts would need nonces.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          {
            key: "Strict-Transport-Security",
            value: "max-age=31536000; includeSubDomains",
          },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
        ],
      },
    ];
  },
  // PostHog API calls use trailing slashes; without this Next redirects them
  skipTrailingSlashRedirect: true,
};

export default nextConfig;

initOpenNextCloudflareForDev();
