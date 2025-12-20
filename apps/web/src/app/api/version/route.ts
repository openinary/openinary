import { NextResponse } from "next/server";
import { readFileSync, existsSync, readdirSync } from "fs";
import { join } from "path";

export async function GET() {
  let imageTag = process.env.IMAGE_TAG || "dev";
  let source = "process.env (default)";
  
  // Debug: check what paths we're testing
  const configPaths = [
    "/app/runtime-config.json",                       // Docker absolute path
    join(process.cwd(), "../../../runtime-config.json"), // /app/web-standalone/apps/web -> /app
    join(process.cwd(), "../../runtime-config.json"),    // /app/web-standalone/apps/web -> /app/web-standalone
    join(process.cwd(), "runtime-config.json")           // Same directory
  ];
  
  const pathsChecked: any[] = [];
  
  // Try to read from runtime-config.json (created by init-env.js in Docker)
  try {
    for (const configPath of configPaths) {
      const exists = existsSync(configPath);
      pathsChecked.push({ path: configPath, exists });
      
      if (exists) {
        const config = JSON.parse(readFileSync(configPath, "utf-8"));
        if (config.IMAGE_TAG && config.IMAGE_TAG !== "dev") {
          imageTag = config.IMAGE_TAG;
          source = `runtime-config.json (${configPath})`;
        }
        break;
      }
    }
  } catch (err: any) {
    // Fallback to process.env
    console.error("Could not read runtime-config.json:", err);
    pathsChecked.push({ error: err.message });
  }
  
  // Check what files exist in /app
  let appDirContents: string[] = [];
  try {
    if (existsSync("/app")) {
      appDirContents = readdirSync("/app");
    }
  } catch (err) {
    appDirContents = ["error reading /app"];
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
      totalEnvVars: Object.keys(process.env).length,
      pathsChecked,
      appDirContents: appDirContents.slice(0, 20) // Limit to first 20 items
    }
  };
  
  return NextResponse.json(debugInfo);
}
