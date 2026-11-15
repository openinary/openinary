import { NextResponse } from "next/server";
import { hasAdmin } from "shared";
import logger from "@/lib/logger";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json({ setupComplete: hasAdmin() });
  } catch (error) {
    logger.error("Error checking setup status", { error });
    return NextResponse.json(
      { error: "Failed to check setup status" },
      { status: 500 },
    );
  }
}
