import type { NextConfig } from "next";
import { PHASE_DEVELOPMENT_SERVER } from "next/constants";

export default function nextConfig(phase: string): NextConfig {
  // `next dev` defaults to the local stack (server on 3100, customer app on
  // 3101) so an admin started without .env never sends mutations to
  // production. Builds default to production.
  const dev = phase === PHASE_DEVELOPMENT_SERVER;
  return {
    // NEXT_PUBLIC_* are inlined at build time, so Worker vars never reach them.
    // Production values as build defaults, so a build without .env.production
    // is still pointed at production rather than at undefined. .env files
    // still win.
    env: {
      // Same API as the customer dashboard; this origin must be the server's
      // ADMIN_ORIGIN or its cookies and CORS preflights are rejected.
      NEXT_PUBLIC_SERVER_URL:
        process.env.NEXT_PUBLIC_SERVER_URL ??
        (dev ? "http://localhost:3100" : "https://cdn.openinary.dev"),
      // Where a signed-out visitor is sent: the session cookie is scoped to
      // ".openinary.dev", so signing in on the customer app signs in here too.
      NEXT_PUBLIC_APP_URL:
        process.env.NEXT_PUBLIC_APP_URL ??
        (dev ? "http://localhost:3101" : "https://app.openinary.dev"),
    },
  };
}
