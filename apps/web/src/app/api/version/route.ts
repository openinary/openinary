import { NextResponse } from "next/server";

export async function GET() {
  // Read IMAGE_TAG at runtime (not build time)
  const imageTag = process.env.IMAGE_TAG || "dev";
  
  return NextResponse.json({ version: imageTag });
}
