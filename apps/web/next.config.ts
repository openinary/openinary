import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Enable standalone output for Docker deployments
  output: "standalone",
  env: {
    NEXT_PUBLIC_API_BASE_URL: process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:3000",
    // Expose IMAGE_TAG from root .env to the client
    NEXT_PUBLIC_IMAGE_TAG: process.env.IMAGE_TAG || "dev",
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
