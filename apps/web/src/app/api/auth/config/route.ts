import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/** Public: lets the frontend check its URL matches the configured one. */
export async function GET() {
  return NextResponse.json({
    betterAuthUrl: process.env.BETTER_AUTH_URL,
    nodeEnv: process.env.NODE_ENV,
  });
}
