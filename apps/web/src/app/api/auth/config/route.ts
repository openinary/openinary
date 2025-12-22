import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * API route to expose authentication configuration
 * Used by frontend to validate if URLs match the current environment
 * This is a public endpoint (no authentication required)
 */
export async function GET() {
  try {
    const config = {
      betterAuthUrl: process.env.BETTER_AUTH_URL,
      allowedOrigin: process.env.ALLOWED_ORIGIN,
      nodeEnv: process.env.NODE_ENV,
    };

    return NextResponse.json(config);
  } catch (error) {
    console.error("Error fetching auth config:", error);
    return NextResponse.json(
      { error: "Failed to fetch configuration" },
      { status: 500 }
    );
  }
}
