import path from "path";

/**
 * Single source of truth for the directory where original assets live.
 *
 * Historically Openinary hardcoded "public" as the base directory: cloud
 * objects were stored under the `public/` key prefix and local files under
 * `./public`. This module makes that directory configurable via the
 * `STORAGE_ASSETS_DIR` environment variable while keeping "public" as the
 * default, so existing deployments are unaffected.
 *
 * Setting `STORAGE_ASSETS_DIR=""` (empty) maps assets to the bucket / local
 * root, i.e. with no prefix at all.
 */

const DEFAULT_ASSETS_DIR = "public";

/**
 * Normalizes a relative path segment: strips leading/trailing slashes and
 * rejects any path-traversal (`..`) segment, so neither the configured assets
 * directory nor a relative asset path can ever escape its intended base.
 */
function normalizeRelativePath(value: string): string {
  const trimmed = value.replace(/^\/+/, "").replace(/\/+$/, "");

  if (trimmed.split("/").some((segment) => segment === "..")) {
    throw new Error(
      `Invalid asset path: path traversal ("..") is not allowed (received "${value}")`,
    );
  }

  return trimmed;
}

/**
 * Returns the normalized assets directory name (no leading/trailing slashes).
 * Defaults to "public" when STORAGE_ASSETS_DIR is unset. An explicitly empty
 * value means "root" and yields an empty string.
 */
export function getAssetsDir(): string {
  const raw = process.env.STORAGE_ASSETS_DIR;

  // Unset (undefined) falls back to the default. An explicit "" means root.
  if (raw === undefined) {
    return DEFAULT_ASSETS_DIR;
  }

  return normalizeRelativePath(raw);
}

/**
 * Builds a cloud storage object key for a relative asset path, prefixing it
 * with the configured assets directory. When the directory is empty (root),
 * the relative path is returned as-is.
 *
 * @example buildAssetKey("cows/black.png") // "public/cows/black.png"
 */
export function buildAssetKey(relativePath: string): string {
  const dir = getAssetsDir();
  const normalized = normalizeRelativePath(relativePath);
  // Cloud object keys always use POSIX ("/") separators, regardless of host OS.
  return dir ? path.posix.join(dir, normalized) : normalized;
}

/**
 * Returns the cloud storage prefix used to list assets (trailing slash
 * included). Empty string when assets live at the bucket root.
 *
 * @example getAssetsPrefix() // "public/"
 */
export function getAssetsPrefix(): string {
  const dir = getAssetsDir();
  return dir ? `${dir}/` : "";
}

/**
 * Returns the base filesystem path for assets in local (no-cloud) mode.
 *
 * @example getLocalAssetsBasePath() // "public"  (path.join(".", "public"))
 */
export function getLocalAssetsBasePath(): string {
  const dir = getAssetsDir();
  return dir ? path.join(".", dir) : ".";
}

/**
 * Builds the full local filesystem path for a relative asset path in local
 * (no-cloud) mode, joining it onto the configured assets base directory.
 *
 * @example getLocalAssetPath("cows/black.png") // "public/cows/black.png"
 */
export function getLocalAssetPath(relativePath: string): string {
  return path.join(getLocalAssetsBasePath(), relativePath);
}
