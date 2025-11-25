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
  async headers() {
    // In production, use specific allowed origin from env, otherwise allow localhost for dev
    const allowedOrigin = 
      process.env.NODE_ENV === "production"
        ? process.env.ALLOWED_ORIGIN! || process.env.BETTER_AUTH_URL! 
        : "http://localhost:3001";

    return [
      {
        // Apply CORS headers to all API routes
        source: "/api/:path*",
        headers: [
          { key: "Access-Control-Allow-Credentials", value: "true" },
          { key: "Access-Control-Allow-Origin", value: allowedOrigin },
          { key: "Access-Control-Allow-Methods", value: "GET,DELETE,PATCH,POST,PUT,OPTIONS" },
          { key: "Access-Control-Allow-Headers", value: "X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization" },
        ],
      },
    ];
  },
};

export default nextConfig;
