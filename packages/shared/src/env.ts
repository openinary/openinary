import fs from "fs";

/**
 * Origins trusted for cookie-carrying requests: the dev servers and the
 * instance's own public URL. The API adds CORS_ORIGIN on top for sites that
 * embed the uploader; Better Auth does not, so those sites cannot sign in.
 */
export function allowedOrigins(): string[] {
  const origins = ["http://localhost:3000", "http://localhost:3001", process.env.BETTER_AUTH_URL];
  return [...new Set(origins.filter((o): o is string => !!o))];
}

// Values shipped in templates and docs. Every copy-paste deployment shares
// them, so they sign nothing private and identify no one instance.
const PLACEHOLDER_SECRETS = new Set([
  "your-secret-here-min-32-chars",
  "your-custom-secret-key-here",
  "build-time-secret-will-be-replaced",
]);

export function isPlaceholderSecret(secret: string): boolean {
  return PLACEHOLDER_SECRETS.has(secret);
}

/**
 * The running image's version. /app/version.txt is baked at build time and
 * holds the real tag even for a :latest image, so it wins unless it says
 * "latest" itself (a local build), then IMAGE_TAG. Undefined from source.
 */
export function readVersion(): string | undefined {
  let baked: string | undefined;
  try {
    baked = fs.readFileSync("/app/version.txt", "utf8").trim() || undefined;
  } catch {
    // not a Docker image
  }
  if (baked && baked !== "latest") return baked;
  return process.env.IMAGE_TAG || baked;
}
