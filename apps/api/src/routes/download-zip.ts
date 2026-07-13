import { Hono } from "hono";
import type { RouteDeps } from "../config/deps";
import { zipSync } from "fflate";
import fs from "fs";
import path from "path";
import logger, { serializeError } from "../utils/logger";

const MAX_PATHS = 200;

type ZipItem = { path: string; kind?: "file" | "folder" };

function sanitizePath(raw: string): string {
  return decodeURIComponent(raw)
    .replace(/\.\./g, "")
    .replace(/\\/g, "/")
    .replace(/\/+/g, "/")
    .replace(/^\/+/, "")
    .replace(/\/+$/, "");
}

function collectLocalFiles(
  dir: string,
  base: string,
): { arcPath: string; fullPath: string }[] {
  const results: { arcPath: string; fullPath: string }[] = [];
  if (!fs.existsSync(dir)) return results;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    const rel = path.join(base, entry.name);
    if (entry.isDirectory()) {
      results.push(...collectLocalFiles(full, rel));
    } else {
      results.push({ arcPath: rel.replace(/\\/g, "/"), fullPath: full });
    }
  }
  return results;
}

/**
 * POST /download-zip
 * body: { items: { path: string; kind?: "file" | "folder" }[] } or { paths: string[] }
 * Bundles multiple files and/or folders (mixed) into a single ZIP archive.
 * Entries keep their full relative path so items with the same filename in
 * different folders don't collide inside the archive.
 *
 * When the caller already knows an item's kind, passing it via `items` skips
 * the folderExists probe (an extra HeadObject + ListObjects round trip per
 * item) and lets every item download in parallel instead of one at a time.
 */
export function createDownloadZipRoute(deps: RouteDeps) {
  const { storage } = deps;
  const downloadZip = new Hono();

  downloadZip.post("/", async (c) => {
    let body: { paths?: unknown; items?: unknown } = {};
    try {
      body = await c.req.json();
    } catch {
      return c.json(
        { error: "Bad request", message: "Invalid JSON body" },
        400,
      );
    }

    const items: ZipItem[] = Array.isArray(body.items)
      ? body.items
          .filter(
            (i): i is { path: unknown; kind?: unknown } =>
              typeof i === "object" &&
              i !== null &&
              typeof (i as any).path === "string",
          )
          .map((i) => ({
            path: i.path as string,
            kind: i.kind === "file" || i.kind === "folder" ? i.kind : undefined,
          }))
      : Array.isArray(body.paths)
        ? body.paths
            .filter((p): p is string => typeof p === "string")
            .map((path) => ({ path }))
        : [];

    if (items.length === 0) {
      return c.json(
        {
          error: "Bad request",
          message: "A non-empty 'items' or 'paths' array is required",
        },
        400,
      );
    }

    if (items.length > MAX_PATHS) {
      return c.json(
        {
          error: "Bad request",
          message: `Too many items requested (max ${MAX_PATHS})`,
        },
        400,
      );
    }

    try {
      const zipFiles: Record<string, Uint8Array> = {};

      const addFolder = async (cleanPath: string) => {
        const prefix = `public/${cleanPath}/`;
        const objects = await storage!.list(prefix);
        await Promise.all(
          objects.map(async (obj) => {
            const relPath = obj.key.replace(`public/${cleanPath}/`, "");
            if (!relPath || relPath.endsWith("/")) return;
            const buffer = await storage!.downloadOriginal(
              `${cleanPath}/${relPath}`,
            );
            zipFiles[`${cleanPath}/${relPath}`] = new Uint8Array(buffer);
          }),
        );
      };

      await Promise.all(
        items.map(async ({ path: raw, kind }) => {
          const cleanPath = sanitizePath(raw);
          if (!cleanPath) return;

          if (storage) {
            const isFolder = kind
              ? kind === "folder"
              : await storage.folderExists(cleanPath);
            if (isFolder) {
              await addFolder(cleanPath);
            } else {
              try {
                const buffer = await storage.downloadOriginal(cleanPath);
                zipFiles[cleanPath] = new Uint8Array(buffer);
              } catch {
                // Skip missing files rather than failing the whole archive
              }
            }
          } else {
            const localPath = path.join("./public", cleanPath);
            if (!fs.existsSync(localPath)) return;
            if (fs.statSync(localPath).isDirectory()) {
              for (const entry of collectLocalFiles(localPath, cleanPath)) {
                zipFiles[entry.arcPath] = new Uint8Array(
                  fs.readFileSync(entry.fullPath),
                );
              }
            } else {
              zipFiles[cleanPath] = new Uint8Array(fs.readFileSync(localPath));
            }
          }
        }),
      );

      if (Object.keys(zipFiles).length === 0) {
        return c.json(
          { error: "Not found", message: "No files found for the given paths" },
          404,
        );
      }

      const zipBuffer = zipSync(zipFiles);

      c.header("Content-Type", "application/zip");
      c.header("Content-Disposition", `attachment; filename="download.zip"`);
      c.header("Content-Length", zipBuffer.length.toString());
      c.header("Cache-Control", "private, no-store");
      return c.body(zipBuffer);
    } catch (error) {
      logger.error(
        { error: serializeError(error) },
        "Bulk zip download failed",
      );
      return c.json(
        {
          error: "Internal server error",
          message: error instanceof Error ? error.message : "Unknown error",
        },
        500,
      );
    }
  });

  return downloadZip;
}
