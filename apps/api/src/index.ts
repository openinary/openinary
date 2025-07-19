import { Hono } from "hono";
import { cors } from "hono/cors";
import type { R2Bucket } from "./types";
// Helper functions for dimension extraction
function extractJPEGDimensions(
  data: Uint8Array,
): { width: number; height: number } | null {
  let i = 0;
  if (data[i] !== 0xff || data[i + 1] !== 0xd8) return null; // Not a JPEG

  i += 2;
  while (i < data.length) {
    if (data[i] !== 0xff) return null;

    const marker = data[i + 1];
    if (marker === 0xc0 || marker === 0xc1 || marker === 0xc2) {
      // SOF marker found - check bounds before accessing
      if (i + 8 >= data.length) return null;
      const height = (data[i + 5]! << 8) | data[i + 6]!;
      const width = (data[i + 7]! << 8) | data[i + 8]!;
      return { width, height };
    }

    // Skip to next marker - check bounds before accessing length
    if (i + 3 >= data.length) return null;
    const length = (data[i + 2]! << 8) | data[i + 3]!;
    i += 2 + length;
  }

  return null;
}

function extractPNGDimensions(
  data: Uint8Array,
): { width: number; height: number } | null {
  // Check PNG signature
  if (
    data.length < 24 ||
    data[0] !== 0x89 ||
    data[1] !== 0x50 ||
    data[2] !== 0x4e ||
    data[3] !== 0x47 ||
    data[4] !== 0x0d ||
    data[5] !== 0x0a ||
    data[6] !== 0x1a ||
    data[7] !== 0x0a
  ) {
    return null;
  }

  // IHDR chunk should be at offset 8
  if (
    data[12] !== 0x49 ||
    data[13] !== 0x48 ||
    data[14] !== 0x44 ||
    data[15] !== 0x52
  ) {
    return null;
  }

  const width =
    (data[16]! << 24) | (data[17]! << 16) | (data[18]! << 8) | data[19]!;
  const height =
    (data[20]! << 24) | (data[21]! << 16) | (data[22]! << 8) | data[23]!;

  return { width, height };
}

function extractMP4Dimensions(
  data: Uint8Array,
): { width: number; height: number } | null {
  // Simple MP4 dimension extraction from tkhd atom
  let i = 0;
  while (i < data.length - 8) {
    if (i + 4 >= data.length) break;

    const atomSize =
      (data[i]! << 24) |
      (data[i + 1]! << 16) |
      (data[i + 2]! << 8) |
      data[i + 3]!;

    if (atomSize <= 0 || atomSize > data.length - i) break;

    // Check for 'tkhd' atom
    if (
      data[i + 4] === 0x74 && // 't'
      data[i + 5] === 0x6b && // 'k'
      data[i + 6] === 0x68 && // 'h'
      data[i + 7] === 0x64 // 'd'
    ) {
      // tkhd atom found, extract dimensions
      // Skip version and flags (4 bytes) + creation/modification times + track ID
      const offset = i + 8 + 4 + 16 + 4;
      if (offset + 8 < data.length) {
        // Skip reserved fields and matrix, go to width/height (last 8 bytes of tkhd)
        const widthOffset = offset + 64;
        const heightOffset = offset + 68;

        if (heightOffset + 4 <= data.length) {
          const width =
            (data[widthOffset]! << 24) |
            (data[widthOffset + 1]! << 16) |
            (data[widthOffset + 2]! << 8) |
            data[widthOffset + 3]!;
          const height =
            (data[heightOffset]! << 24) |
            (data[heightOffset + 1]! << 16) |
            (data[heightOffset + 2]! << 8) |
            data[heightOffset + 3]!;

          // Convert from fixed-point to integer (divide by 65536)
          return { width: width >> 16, height: height >> 16 };
        }
      }
      break;
    }

    i += atomSize;
  }

  return null;
}

type Bindings = {
  BUCKET: R2Bucket;
  BUCKET_NAME: string;
  PUBLIC_URL: string;
  R2_PUBLIC_URL: string;
};

const app = new Hono<{ Bindings: Bindings }>();

// Enable CORS for all origins
app.use(
  "*",
  cors({
    origin: "*",
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"],
  }),
);

// Helper function to process a single file
async function processFile(file: File, bucket: any, timestamp: number) {
  // Extract file information
  const fileExtension = file.name.split(".").pop()?.toLowerCase() || "";
  const fileName = file.name.split(".").slice(0, -1).join(".") || file.name;

  // Determine media type
  const mediaType = file.type.startsWith("image/")
    ? "image"
    : file.type.startsWith("video/")
      ? "video"
      : "unknown";

  // Get dimensions for images and videos
  let dimensions = "unknown";
  let fileArrayBuffer: ArrayBuffer | null = null;

  if (mediaType === "image") {
    try {
      fileArrayBuffer = await file.arrayBuffer();
      const uint8Array = new Uint8Array(fileArrayBuffer);

      // Simple dimension extraction for common formats
      if (file.type === "image/jpeg") {
        const dims = extractJPEGDimensions(uint8Array);
        if (dims) dimensions = `${dims.width}x${dims.height}`;
      } else if (file.type === "image/png") {
        const dims = extractPNGDimensions(uint8Array);
        if (dims) dimensions = `${dims.width}x${dims.height}`;
      }
    } catch (e) {
      console.warn("Could not extract dimensions:", e);
    }
  } else if (mediaType === "video") {
    try {
      // Only read first 1MB for video dimension extraction to avoid memory issues
      const maxBytes = 1024 * 1024; // 1MB
      const blob = file.slice(0, maxBytes);
      fileArrayBuffer = await blob.arrayBuffer();
      const uint8Array = new Uint8Array(fileArrayBuffer);

      // Extract dimensions for MP4 videos
      if (file.type === "video/mp4" || file.type === "video/quicktime") {
        const dims = extractMP4Dimensions(uint8Array);
        if (dims) dimensions = `${dims.width}x${dims.height}`;
      }
    } catch (e) {
      console.warn("Could not extract video dimensions:", e);
    }
  }

  // Generate unique filename with timestamp
  const key = `${timestamp}-${file.name}`;

  // Upload to R2 with enhanced metadata
  // Use arrayBuffer if we read it for dimensions, otherwise use stream
  // For videos, we only read a portion for dimensions, so use the full file stream
  const uploadData =
    fileArrayBuffer && mediaType === "image" ? fileArrayBuffer : file.stream();

  const result = await bucket.put(key, uploadData, {
    httpMetadata: {
      contentType: file.type,
    },
    customMetadata: {
      originalName: file.name,
      fileName: fileName,
      extension: fileExtension,
      mediaType: mediaType,
      originalDimensions: dimensions,
      uploadedAt: new Date().toISOString(),
    },
  });

  if (!result) {
    throw new Error(`Upload failed for file: ${file.name}`);
  }

  return {
    success: true,
    key: result.key,
    size: result.size,
    etag: result.etag,
    uploaded: result.uploaded,
    customMetadata: result.customMetadata,
  };
}

const router = app
  .get("/", (c) =>
    c.html(
      `<div style="display:flex;align-items:center;gap:8px">
        <svg width="20" height="20" viewBox="0 0 623 623" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M622.222 444.444V177.778h-88.889v-88.89h-88.888V0H177.778v88.889h-88.89v88.889h266.668v266.666z" fill="#FFAE69"/><path d="M88.889 177.778H0v88.889h88.889z" fill="#FFAE69"/><path d="M88.889 533.333h88.889V355.556h88.889v-88.889h88.889v-88.889H88.889v88.889H0v177.777h88.889zm177.778 0h-88.889v88.889h88.889z" fill="#FF8E2D"/><path d="M177.778 355.556v177.777h88.889v88.889h177.777v-88.889h88.889v-88.889H355.556v-88.888z" fill="#D86401"/></svg>
        <h1 style="font-size:1.2rem;font-family: sans-serif;">Openinary API</h1>
      </div>`,
    ),
  )
  .get("/hello/:name", (c) =>
    c.json({ message: `Hello ${c.req.param("name")}` }),
  )
  .get("/private", (c) => c.text("supersecret"))

  // R2 File Upload - supports single or multiple files
  .post("/upload", async (c) => {
    try {
      const formData = await c.req.formData();
      const timestamp = Date.now();

      // Get all files from form data
      const files: File[] = [];

      // Check for single file upload (field name: "file")
      const singleFile = formData.get("file") as File;
      if (singleFile) {
        files.push(singleFile);
      }

      // Check for multiple file upload (field name: "files")
      const multipleFiles = formData.getAll("files") as File[];
      if (multipleFiles.length > 0) {
        files.push(...multipleFiles.filter((f) => f instanceof File));
      }

      if (files.length === 0) {
        return c.json({ error: "No files provided" }, 400);
      }

      // Process all files
      const results = [];
      const errors = [];

      for (const file of files) {
        try {
          const result = await processFile(file, c.env.BUCKET, timestamp);
          results.push(result);
        } catch (error) {
          console.error(`Error processing file ${file.name}:`, error);
          errors.push({
            fileName: file.name,
            error: error instanceof Error ? error.message : "Upload failed",
          });
        }
      }

      // Return response based on results
      if (results.length === 0) {
        return c.json(
          {
            error: "All uploads failed",
            details: errors,
          },
          500,
        );
      }

      if (files.length === 1) {
        // Single file upload - return single result for backward compatibility
        if (results.length === 1) {
          return c.json(results[0]);
        } else {
          return c.json(
            {
              error: "Upload failed",
              details: errors[0],
            },
            500,
          );
        }
      } else {
        // Multiple file upload - return array of results
        return c.json({
          success: true,
          totalFiles: files.length,
          successfulUploads: results.length,
          failedUploads: errors.length,
          results: results,
          errors: errors.length > 0 ? errors : undefined,
        });
      }
    } catch (error) {
      console.error("Upload error:", error);
      return c.json({ error: "Upload failed" }, 500);
    }
  })

  // List all files
  .get("/files", async (c) => {
    try {
      const result = await c.env.BUCKET.list({
        include: ["httpMetadata", "customMetadata"],
      });

      const folders = new Set<string>();
      const rootFiles: any[] = [];

      // Séparer les fichiers en dossiers et fichiers racine
      result.objects.forEach((obj) => {
        if (obj.key.includes("/")) {
          // C'est un fichier dans un dossier
          const folderName = obj.key.split("/")[0];
          if (folderName) {
            folders.add(folderName);
          }
        } else {
          // C'est un fichier à la racine
          rootFiles.push({
            type: "file" as const,
            key: obj.key,
            size: obj.size,
            etag: obj.etag,
            uploaded: obj.uploaded,
            url: `${c.env.R2_PUBLIC_URL}/${obj.key}`,
            customMetadata: obj.customMetadata,
          });
        }
      });

      // Créer les éléments de dossier
      const folderItems = Array.from(folders).map((folderName) => ({
        type: "folder" as const,
        key: folderName,
        name: folderName,
      }));

      // Combiner dossiers et fichiers racine
      const items = [...folderItems, ...rootFiles];

      return c.json({
        bucket: c.env.BUCKET_NAME,
        items: items,
        truncated: result.truncated,
      });
    } catch (error) {
      console.error("List files error:", error);
      return c.json({ error: "Failed to list files" }, 500);
    }
  })

  // Get files in a specific folder
  .get("/files/folder/:key", async (c) => {
    try {
      const folderKey = c.req.param("key");
      const result = await c.env.BUCKET.list({
        include: ["httpMetadata", "customMetadata"],
        prefix: `${folderKey}/`,
      });

      const items = result.objects.map((obj) => ({
        type: "file" as const,
        key: obj.key,
        size: obj.size,
        etag: obj.etag,
        uploaded: obj.uploaded,
        url: `${c.env.R2_PUBLIC_URL}/${obj.key}`,
        customMetadata: obj.customMetadata,
      }));

      return c.json({
        bucket: c.env.BUCKET_NAME,
        items: items,
        truncated: result.truncated,
      });
    } catch (error) {
      console.error("List folder files error:", error);
      return c.json({ error: "Failed to list folder files" }, 500);
    }
  })

  // Get a specific file
  .get("/files/:key", async (c) => {
    try {
      const key = c.req.param("key");
      const object = await c.env.BUCKET.get(key);

      if (!object) {
        return c.json({ error: "File not found" }, 404);
      }

      // Set appropriate headers
      const headers = new Headers();
      if (object.httpMetadata?.contentType) {
        headers.set("Content-Type", object.httpMetadata.contentType);
      }
      headers.set("Content-Length", object.size.toString());
      headers.set("ETag", object.httpEtag);

      return new Response(object.body, { headers });
    } catch (error) {
      console.error("Get file error:", error);
      return c.json({ error: "Failed to get file" }, 500);
    }
  })

  // Delete a file
  .delete("/files/:key", async (c) => {
    try {
      const key = c.req.param("key");

      // Check if file exists first
      const object = await c.env.BUCKET.head(key);
      if (!object) {
        return c.json({ error: "File not found" }, 404);
      }

      await c.env.BUCKET.delete(key);

      return c.json({
        success: true,
        message: "File deleted",
      });
    } catch (error) {
      console.error("Delete file error:", error);
      return c.json({ error: "Failed to delete file" }, 500);
    }
  });

export default app;

export type AppType = typeof router;
