import { NextResponse } from "next/server";
import { initDb } from "shared/db";
import { hasAdminAccount } from "shared/auth";
import logger from "@/lib/logger";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    // Ensure the shared Prisma-backed database is initialized, then check
    // whether any user (admin) already exists.
    await initDb();

    return NextResponse.json({
      setupComplete: await hasAdminAccount(),
    });
  } catch (error) {
    logger.error("Error checking setup status", { error });
    return NextResponse.json(
      { error: "Failed to check setup status" },
      { status: 500 },
    );
  }
}
