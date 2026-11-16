import type { NextConfig } from "next";
import path from "path";
import { config } from "dotenv";
import { existsSync } from "fs";

// The monorepo shares one .env at its root.
const rootEnvPath = path.resolve(__dirname, "../../.env");
if (existsSync(rootEnvPath)) {
  config({ path: rootEnvPath });
}

const nextConfig: NextConfig = {
  output: "standalone",
  // Workspace-linked packages: Next must run its own transform pipeline over
  // them (not treat them as opaque node_modules code) to respect "use client",
  // and @openinary/dashboard ships TypeScript source only.
  transpilePackages: ["@openinary/ui", "@openinary/dashboard"],
  env: {
    NEXT_PUBLIC_API_BASE_URL: process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:3000",
    NEXT_PUBLIC_IMAGE_TAG: process.env.IMAGE_TAG || "latest",
  },
  // Settings used to be a dialog opened by ?settings=<tab>; keep old links.
  async redirects() {
    return [
      {
        source: "/",
        has: [{ type: "query", key: "settings", value: "(?<tab>[a-z-]+)" }],
        destination: "/settings/:tab",
        permanent: false,
      },
      // Usage was renamed Logs.
      { source: "/settings/activity", destination: "/settings/logs", permanent: false },
    ];
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
