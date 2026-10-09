import type { NextConfig } from "next";
import path from "path";
import { config } from "dotenv";
import { existsSync } from "fs";

// Load .env from monorepo root (../../.env from apps/web/)
const rootEnvPath = path.resolve(__dirname, "../../.env");
if (existsSync(rootEnvPath)) {
  config({ path: rootEnvPath });
}

const nextConfig: NextConfig = {
  // Enable standalone output for Docker deployments
  output: "standalone",
  // Workspace-linked package: Next must run its own transform pipeline over
  // it (not treat it as opaque node_modules code) to respect "use client".
  transpilePackages: ["@openinary/ui"],
  serverExternalPackages: ["@prisma/client"],
  // Standalone output must carry the shared package's prisma dir (schema +
  // migrations — db/index.ts resolves ../../prisma from its dist location)
  // and the Prisma CLI (initDb shells out to `npx prisma migrate deploy`;
  // the CLI is never imported, so tracing alone misses it).
  outputFileTracingIncludes: {
    "/api/**": [
      "../../packages/shared/prisma/**",
      "../../packages/shared/node_modules/prisma/**",
    ],
  },
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
    // Disable ESLint during build for Docker
    ignoreDuringBuilds: true,
  },
  typescript: {
    // Disable TypeScript errors during build for Docker
    ignoreBuildErrors: true,
  },
};

export default nextConfig;
