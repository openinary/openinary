import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Enable standalone output for Docker deployments
  output: "standalone",
  env: {
    NEXT_PUBLIC_API_BASE_URL: process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:3000",
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
