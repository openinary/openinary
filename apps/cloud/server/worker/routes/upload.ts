// /upload: originals into a bucket, from the dashboard, an API key, or a
// customer's own site holding a presigned token.

import {
  isVideoExt,
  extOf,
  stripUrlHostile,
  validateUploadContent,
  validateUploadFileType,
} from "@openinary/core/url";
import { captureEvent } from "../lib/analytics.js";
import { checkFeature, megabytes, quotaError } from "../lib/billing.js";
import { meterFor } from "../lib/meter.js";
import { cdnFilePath } from "../cdn/path.js";
import { recordDuration } from "../media-duration.js";
import * as r2 from "../r2-storage.js";
import { signUploadToken, verifyUploadToken } from "../upload-token.js";
import { parseDuration } from "../video-duration.js";
import { normalizeFolder } from "./params.js";
import {
  type App,
  apiKeyFrom,
  applySessionTenant,
  meterStorage,
  setTenant,
} from "./tenant.js";

/**
 * The name a file is stored under. Multipart filenames are attacker-controlled:
 * R2 keys are opaque, so a name like "../../other-user/x.png" doesn't
 * traverse, it just writes a key outside the folder the caller was authorized
 * for - and with presigned tokens that caller is an arbitrary end-user of a
 * customer's site. Real browsers only ever put a basename here, so this drops
 * nothing legitimate.
 */
function storedName(file: File): string {
  return stripUrlHostile(file.name.split(/[/\\]/).pop() || "").normalize("NFC");
}

const SIGN_MAX_EXPIRES_IN = 3600;
const SIGN_DEFAULT_EXPIRES_IN = 300;

export function uploadRoutes(app: App): void {
  /**
   * Mints a presigned upload token for @openinary/file-uploader. Called by the
   * customer's *backend* with its API key, never from a browser - that's the
   * whole point: the API key stays server-side and only this short-lived,
   * tenant-scoped token reaches the page.
   */
  app.post("/upload/sign", async (c) => {
    const body = await c.req
      .json<{ folder?: unknown; expiresIn?: unknown }>()
      .catch(() => ({}) as Record<string, never>);
    const folder = normalizeFolder(body.folder);
    if (folder.split("/").some((s) => s === "." || s === "..")) {
      return c.json({ success: false, error: "Invalid folder" }, 400);
    }
    const requested =
      typeof body.expiresIn === "number" && Number.isFinite(body.expiresIn)
        ? body.expiresIn
        : SIGN_DEFAULT_EXPIRES_IN;
    const expiresIn = Math.min(
      Math.max(Math.floor(requested), 1),
      SIGN_MAX_EXPIRES_IN,
    );
    const expires = Math.floor(Date.now() / 1000) + expiresIn;
    const signature = signUploadToken({
      userId: c.get("userId"),
      bucketId: c.get("bucketId"),
      folder,
      expires,
    });
    // `success` isn't decoration: signUpload() treats a 200 without it as a
    // failure and throws.
    return c.json({ success: true, signature, expires, folder });
  });

  app.post("/upload", async (c) => {
    const formData = await c.req.formData();

    // Two ways in. A presigned token names its own tenant *and* folder, so
    // neither is read from the request - a token minted for one bucket/folder
    // can't be replayed against another by editing the form fields.
    const signature = formData.get("signature");
    const token =
      typeof signature === "string" ? verifyUploadToken(signature) : null;
    if (token) {
      setTenant(c, token.userId, token.bucketId, {});
      // The Get started checklist's "your app uploaded" signal. Only reachable
      // on this branch: the session path below is the dashboard's own
      // uploader, which proves nothing about an integration. A failure here
      // costs a checkbox, never the upload.
      c.executionCtx.waitUntil(
        meterFor(c.env.USAGE_METER, token.userId)
          .markApiUpload()
          .then(async (first) => {
            if (first) await captureEvent("first_app_upload", token.userId);
          })
          .catch((error) =>
            console.error("%s", `Failed to mark API upload for ${token.userId}`, error),
          ),
      );
    } else if (typeof signature === "string") {
      // Distinguish "bad/expired token" from "no token at all" - the component
      // retries after re-signing, and a generic 401 gives it nothing to act on.
      return c.json(
        { success: false, error: "Invalid or expired upload signature" },
        401,
      );
    } else if (!(await applySessionTenant(c))) {
      return c.json({ success: false, error: "Unauthorized" }, 401);
    }

    const destFolder = normalizeFolder(token ? token.folder : formData.get("folder"));
    const files = formData
      .getAll("files")
      .filter((f): f is File => f instanceof File);
    if (files.length === 0)
      return c.json({ success: false, error: "No files uploaded" }, 400);
    // Core's upload whitelist: rejects svg (stored-XSS vector when served
    // inline) and anything the transform pipeline can't decode. The
    // "application/octet-stream" fallback mirrors what uploadOriginal stores
    // below - it's also how browsers hand over extension-only types like .psd.
    for (const file of files) {
      const fileName = storedName(file);
      if (!fileName || fileName === "." || fileName === "..") {
        return c.json({ success: false, error: "Invalid file name" }, 400);
      }
      if (!validateUploadFileType(file.name, file.type || "application/octet-stream")) {
        return c.json(
          { success: false, error: `Unsupported file type: ${file.name}` },
          400,
        );
      }
      // Name and MIME are client-chosen; the bytes are not.
      const head = new Uint8Array(await file.slice(0, 64).arrayBuffer());
      if (!validateUploadContent(file.name, head)) {
        return c.json(
          { success: false, error: `File content does not match its type: ${file.name}` },
          400,
        );
      }
    }
    const totalBytes = files.reduce((sum, f) => sum + f.size, 0);
    const userId = c.get("userId");
    const customerData = c.get("customerData");
    if (!(await checkFeature(userId, "storage_mb", megabytes(totalBytes), customerData))) {
      return c.json(
        {
          success: false,
          ...(await quotaError(userId, "storage_mb", customerData)),
        },
        402,
      );
    }
    try {
      const tenantRoot = c.get("tenantRoot");
      const uploaded: {
        path: string;
        name: string;
        filename: string;
        size: number;
        url: string;
      }[] = [];
      for (const file of files) {
        const fileName = storedName(file);
        const filePath = destFolder ? `${destFolder}/${fileName}` : fileName;
        const ext = extOf(fileName);
        // Parsed before the upload so a slow/failed R2 write can't leave a
        // stale duration row; slice()/arrayBuffer() don't touch file.stream().
        const seconds = isVideoExt(ext) ? await parseDuration(file, ext) : null;
        await r2.uploadOriginal(
          c.env.MEDIA_BUCKET,
          tenantRoot,
          filePath,
          file.stream(),
          file.type || "application/octet-stream",
        );
        if (seconds != null) await recordDuration(`${tenantRoot}/${filePath}`, seconds);
        // `url` is echoed rather than rebuilt client-side: self-host serves
        // transforms at /t/{path}, cloud at /b/{bucketId}/t/{path}, and letting
        // the server name the delivery prefix is what keeps one component
        // working against both.
        uploaded.push({
          path: filePath,
          name: fileName,
          filename: fileName,
          size: file.size,
          url: cdnFilePath(c.get("bucketId"), filePath),
        });
      }
      // Only the bytes the customer actually uploaded. The transform variants
      // the container writes under the cache prefix are real cost to us too
      // (roughly +40% on top of originals), but deliberately NOT metered: that
      // cache is our optimisation, and its size is a function of how many
      // variants we choose to keep. It is priced into the per-GB rate instead
      // (the storage_mb overage in the Autumn catalog). Deleting a file purges
      // its variants too, so this overhead stays bounded by real data.
      meterStorage(c, totalBytes);
      // Funnel step "first asset uploaded". Server-side so dashboard uploads,
      // API-key uploads and presigned-token uploads all count, under the
      // account owner's user id.
      c.executionCtx.waitUntil(
        captureEvent("asset_uploaded", userId, {
          files: uploaded.length,
          total_mb: megabytes(totalBytes),
          via: token ? "presigned" : apiKeyFrom(c) ? "api_key" : "dashboard",
        }),
      );
      return c.json({ success: true, files: uploaded });
    } catch (error) {
      return c.json(
        {
          success: false,
          error: error instanceof Error ? error.message : "Upload failed",
        },
        500,
      );
    }
  });

  app.post("/upload/createfolder", async (c) => {
    const folderPath = normalizeFolder((await c.req.formData()).get("folder"));
    if (!folderPath)
      return c.json({ success: false, error: "Folder name is required" }, 400);
    try {
      await r2.createFolder(c.env.MEDIA_BUCKET, c.get("tenantRoot"), folderPath);
      return c.json({ success: true, folder: folderPath });
    } catch (error) {
      return c.json(
        {
          success: false,
          error: error instanceof Error ? error.message : "Failed to create folder",
        },
        500,
      );
    }
  });
}
