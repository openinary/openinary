import { NextResponse } from "next/server";
import { readVersion } from "shared";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ version: readVersion() ?? "latest" });
}
