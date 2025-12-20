import { NextResponse } from "next/server";
import { readFileSync, existsSync } from "fs";
import { join } from "path";

export async function GET() {
  let imageTag = process.env.IMAGE_TAG || "dev";
  let source = "process.env (default)";
  
  // Try to read from runtime-config.json (created by init-env.js in Docker)
  try {
    // In standalone mode, the working directory is /app/web-standalone
    // The runtime-config.json is at /app/runtime-config.json
    const configPaths = [
      "/app/runtime-config.json",                    // Docker absolute path
      join(process.cwd(), "../../runtime-config.json"), // Relative from standalone
      join(process.cwd(), "runtime-config.json")        // Same directory
    ];
    
    for (const configPath of configPaths) {
      if (existsSync(configPath)) {
        const config = JSON.parse(readFileSync(configPath, "utf-8"));
        if (config.IMAGE_TAG && config.IMAGE_TAG !== "dev") {
          imageTag = config.IMAGE_TAG;
          source = `runtime-config.json (${configPath})`;
        }
        break;
      }
    }
  } catch (err) {
    // Fallback to process.env
    console.error("Could not read runtime-config.json:", err);
  }
  
  // Also check process.env directly
  if (process.env.IMAGE_TAG && process.env.IMAGE_TAG !== "dev") {
    imageTag = process.env.IMAGE_TAG;
    source = "process.env";
  }
  
  // Debug info for production
  const debugInfo = {
    version: imageTag,
    _debug: {
      source,
      IMAGE_TAG_in_env: 'IMAGE_TAG' in process.env,
      IMAGE_TAG_value: process.env.IMAGE_TAG,
      NODE_ENV: process.env.NODE_ENV,
      cwd: process.cwd(),
      totalEnvVars: Object.keys(process.env).length
    }
  };
  
  return NextResponse.json(debugInfo);
}
