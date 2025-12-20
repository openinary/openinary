import { NextResponse } from "next/server";
import { readFileSync, existsSync } from "fs";

export async function GET() {
  let imageTag = "latest";
  
  // Priority 1: Check process.env.IMAGE_TAG (runtime - works with Dokploy)
  if (process.env.IMAGE_TAG) {
    imageTag = process.env.IMAGE_TAG;
  }
  // Priority 2: Read from /app/version.txt (build-time ARG fallback)
  else {
    try {
      const versionPath = "/app/version.txt";
      if (existsSync(versionPath)) {
        const versionFromFile = readFileSync(versionPath, "utf-8").trim();
        if (versionFromFile && versionFromFile !== "") {
          imageTag = versionFromFile;
        }
      }
    } catch (err) {
      // Fallback to "latest"
    }
  }
  
  return NextResponse.json({ version: imageTag });
}
