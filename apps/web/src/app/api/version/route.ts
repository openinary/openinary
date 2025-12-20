import { NextResponse } from "next/server";

export async function GET() {
  // Read IMAGE_TAG at runtime (not build time)
  const imageTag = process.env.IMAGE_TAG || "dev";
  
  // Debug info for production
  const debugInfo = {
    version: imageTag,
    _debug: {
      IMAGE_TAG_exists: 'IMAGE_TAG' in process.env,
      IMAGE_TAG_value: process.env.IMAGE_TAG,
      NODE_ENV: process.env.NODE_ENV,
      allImageRelated: Object.keys(process.env).filter(k => 
        k.toLowerCase().includes('image') || 
        k.toLowerCase().includes('tag') ||
        k.toLowerCase().includes('version')
      ),
      totalEnvVars: Object.keys(process.env).length
    }
  };
  
  return NextResponse.json(debugInfo);
}
