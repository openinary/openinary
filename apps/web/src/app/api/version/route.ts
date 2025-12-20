import { NextResponse } from "next/server";
import { readFileSync, existsSync, readdirSync } from "fs";
import { join } from "path";

export async function GET() {
  let imageTag = "dev";
  let source = "default";
  
  // Priority 1: Read from /app/version.txt (written at build time with ARG)
  try {
    const versionPath = "/app/version.txt";
    if (existsSync(versionPath)) {
      const versionFromFile = readFileSync(versionPath, "utf-8").trim();
      if (versionFromFile && versionFromFile !== "" && versionFromFile !== "dev") {
        imageTag = versionFromFile;
        source = "version.txt (build-time ARG)";
      }
    }
  } catch (err: any) {
    console.error("Could not read version.txt:", err);
  }
  
  // Priority 2: Check process.env.IMAGE_TAG (runtime override)
  if (process.env.IMAGE_TAG && process.env.IMAGE_TAG !== "dev") {
    imageTag = process.env.IMAGE_TAG;
    source = "process.env (runtime)";
  }
  
  // Priority 3: Try runtime-config.json (legacy)
  try {
    const configPath = "/app/runtime-config.json";
    if (existsSync(configPath)) {
      const config = JSON.parse(readFileSync(configPath, "utf-8"));
      if (config.IMAGE_TAG && config.IMAGE_TAG !== "dev" && imageTag === "dev") {
        imageTag = config.IMAGE_TAG;
        source = "runtime-config.json";
      }
    }
  } catch (err) {
    // Ignore errors
  }
  
  // Debug info for production
  const debugInfo = {
    version: imageTag,
    _debug: {
      source,
      IMAGE_TAG_in_env: 'IMAGE_TAG' in process.env,
      IMAGE_TAG_env_value: process.env.IMAGE_TAG,
      NODE_ENV: process.env.NODE_ENV,
      versionTxtExists: existsSync("/app/version.txt"),
      versionTxtContent: existsSync("/app/version.txt") ? readFileSync("/app/version.txt", "utf-8").trim() : null
    }
  };
  
  return NextResponse.json(debugInfo);
}
