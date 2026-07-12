"use client";

import * as React from "react";

/**
 * Upload engine for the Openinary file uploader.
 *
 * Uploads each file to `${baseUrl}/upload` with its own XMLHttpRequest so that
 * progress, retry and abort are tracked per file. Authentication uses a
 * short-lived presigned signature returned by `sign()`, sent as form fields
 * alongside the file, the same way `POST /upload/sign` on the Openinary API
 * expects it. The browser never holds an API key.
 */

/** A presigned signature minted by your backend via `POST /upload/sign`. */
export interface SignedUpload {
  signature: string;
  /** Unix timestamp (seconds) after which the signature is no longer valid. */
  expires: number;
  /** Folder the signature is scoped to. The upload is sent to this folder. */
  folder: string;
}

/** A file successfully stored by the Openinary API. */
export interface UploadedFile {
  filename: string;
  /** Stored path (may be de-duplicated / renamed by the server). */
  path: string;
  size: number;
  /** Transformation URL prefix, e.g. `/t/{path}`. Prefix with your baseUrl. */
  url: string;
  prewarmedUrls?: string[];
  queuedTransformationUrls?: string[];
}

export type FileUploadStatus =
  | "idle"
  | "uploading"
  | "success"
  | "error"
  | "aborted";

export interface FileUploadState {
  /** Stable client-generated id. */
  id: string;
  file: File;
  name: string;
  size: number;
  status: FileUploadStatus;
  /** 0–100. */
  progress: number;
  /** Object URL for image previews (revoked automatically). */
  previewUrl?: string;
  error?: string;
  result?: UploadedFile;
}

export interface UploadFileError {
  file: FileUploadState;
  message: string;
}

/** Default accepted types, mirroring the Openinary API's ALLOWED_TYPES. */
export const DEFAULT_ACCEPT: Record<string, string[]> = {
  "image/jpeg": [".jpg", ".jpeg"],
  "image/png": [".png"],
  "image/webp": [".webp"],
  "image/avif": [".avif"],
  "image/gif": [".gif"],
  "image/heic": [".heic", ".heif"],
  "image/heif": [".heic", ".heif"],
  "image/vnd.adobe.photoshop": [".psd"],
  "video/mp4": [".mp4"],
  "video/quicktime": [".mov"],
  "video/webm": [".webm"],
};

/** Default max file size: 50MB (matches the API default). */
export const DEFAULT_MAX_SIZE = 50 * 1024 * 1024;

export interface UseFileUploadOptions {
  /** Base URL of the Openinary API, e.g. https://media.example.com. */
  baseUrl?: string;
  /** Returns a presigned upload signature. Called once per upload batch and again per retry. */
  sign: () => Promise<SignedUpload> | SignedUpload;
  transformations?: string[];
  accept?: Record<string, string[]>;
  maxSize?: number;
  /** Client-side cap on the number of files. Not enforced by the server. */
  maxFiles?: number;
  multiple?: boolean;
  /** Max concurrent uploads. Defaults to 3. */
  concurrency?: number;
  onSuccess?: (files: UploadedFile[]) => void;
  onError?: (error: UploadFileError) => void;
  onProgress?: (file: FileUploadState, progress: number) => void;
}

function createId(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function extensionOf(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot === -1 ? "" : name.slice(dot).toLowerCase();
}

/**
 * Client-side validation mirroring the server. Returns an error message or null.
 */
export function validateFile(
  file: File,
  accept: Record<string, string[]>,
  maxSize: number,
): string | null {
  if (file.size > maxSize) {
    const mb = (maxSize / (1024 * 1024)).toFixed(0);
    return `File exceeds the maximum size of ${mb}MB`;
  }

  const allowedExtensions = accept[file.type];
  const ext = extensionOf(file.name);
  const typeAllowed = allowedExtensions?.includes(ext);
  // Fall back to extension-only match (e.g. some browsers report empty type).
  const extAllowed = Object.values(accept).some((exts) => exts.includes(ext));

  if (!typeAllowed && !extAllowed) {
    return `File type not allowed (${file.type || ext || "unknown"})`;
  }

  return null;
}

interface XhrUploadArgs {
  file: FileUploadState;
  baseUrl: string;
  signed: SignedUpload;
  transformations?: string[];
  onProgress: (progress: number) => void;
  registerXhr: (xhr: XMLHttpRequest) => void;
}

function uploadViaXhr({
  file,
  baseUrl,
  signed,
  transformations,
  onProgress,
  registerXhr,
}: XhrUploadArgs): Promise<UploadedFile> {
  return new Promise<UploadedFile>((resolve, reject) => {
    const form = new FormData();
    form.append("files", file.file, file.name);
    form.append("folder", signed.folder);
    form.append("signature", signed.signature);
    form.append("expires", String(signed.expires));
    if (transformations) {
      for (const t of transformations) form.append("transformations", t);
    }

    const xhr = new XMLHttpRequest();
    registerXhr(xhr);
    xhr.open("POST", `${baseUrl.replace(/\/$/, "")}/upload`);

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        onProgress(Math.round((event.loaded / event.total) * 100));
      }
    };

    xhr.onload = () => {
      let body: any = null;
      try {
        body = JSON.parse(xhr.responseText);
      } catch {
        /* non-JSON response */
      }

      if (xhr.status >= 200 && xhr.status < 300 && body?.success) {
        const uploaded = body.files?.[0] as UploadedFile | undefined;
        const failure = body.errors?.[0];
        if (uploaded) {
          resolve(uploaded);
        } else {
          reject(new Error(failure?.error ?? "Upload failed"));
        }
        return;
      }

      // 207 partial success: a single-file request that failed lists the error.
      if (xhr.status === 207 && body?.errors?.[0]) {
        reject(new Error(body.errors[0].error));
        return;
      }

      reject(new Error(body?.error ?? `Upload failed (HTTP ${xhr.status})`));
    };

    xhr.onerror = () =>
      reject(new Error("Network error, check the API URL and CORS settings"));
    xhr.onabort = () => reject(new DOMException("Aborted", "AbortError"));

    xhr.send(form);
  });
}

export function useFileUpload(options: UseFileUploadOptions) {
  const {
    baseUrl,
    sign,
    transformations,
    accept = DEFAULT_ACCEPT,
    maxSize = DEFAULT_MAX_SIZE,
    maxFiles,
    multiple = true,
    concurrency = 3,
    onSuccess,
    onError,
    onProgress,
  } = options;

  const resolvedBaseUrl =
    baseUrl ??
    (typeof process !== "undefined"
      ? process.env.NEXT_PUBLIC_OPENINARY_URL
      : undefined) ??
    "";

  const [files, setFiles] = React.useState<FileUploadState[]>([]);
  const [isUploading, setIsUploading] = React.useState(false);

  // Keep option callbacks fresh without re-creating upload functions.
  const optionsRef = React.useRef(options);
  optionsRef.current = options;

  // Track active XHRs by file id for abort.
  const xhrRef = React.useRef<Map<string, XMLHttpRequest>>(new Map());
  // Track object URLs for cleanup.
  const previewUrlsRef = React.useRef<Set<string>>(new Set());

  React.useEffect(() => {
    const urls = previewUrlsRef.current;
    return () => {
      for (const url of urls) URL.revokeObjectURL(url);
      urls.clear();
    };
  }, []);

  const updateFile = React.useCallback(
    (id: string, patch: Partial<FileUploadState>) => {
      setFiles((prev) =>
        prev.map((f) => (f.id === id ? { ...f, ...patch } : f)),
      );
    },
    [],
  );

  const addFiles = React.useCallback(
    (incoming: FileList | File[]): FileUploadState[] => {
      const list = Array.from(incoming);
      const next: FileUploadState[] = [];

      for (const file of list) {
        const error = validateFile(file, accept, maxSize);
        let previewUrl: string | undefined;
        if (file.type.startsWith("image/")) {
          previewUrl = URL.createObjectURL(file);
          previewUrlsRef.current.add(previewUrl);
        }
        next.push({
          id: createId(),
          file,
          name: file.name,
          size: file.size,
          status: error ? "error" : "idle",
          progress: 0,
          previewUrl,
          error: error ?? undefined,
        });
      }

      setFiles((prev) => {
        const base = multiple ? prev : [];
        let merged = [...base, ...next];
        if (!multiple) merged = merged.slice(-1);
        if (maxFiles !== undefined) merged = merged.slice(0, maxFiles);
        return merged;
      });

      return next;
    },
    [accept, maxSize, multiple, maxFiles],
  );

  const removeFile = React.useCallback((id: string) => {
    setFiles((prev) => {
      const target = prev.find((f) => f.id === id);
      if (target?.previewUrl) {
        URL.revokeObjectURL(target.previewUrl);
        previewUrlsRef.current.delete(target.previewUrl);
      }
      return prev.filter((f) => f.id !== id);
    });
    const xhr = xhrRef.current.get(id);
    if (xhr) {
      xhr.abort();
      xhrRef.current.delete(id);
    }
  }, []);

  const uploadOne = React.useCallback(
    async (fileState: FileUploadState, signed: SignedUpload): Promise<UploadedFile | null> => {
      updateFile(fileState.id, { status: "uploading", progress: 0, error: undefined });
      try {
        const result = await uploadViaXhr({
          file: fileState,
          baseUrl: resolvedBaseUrl,
          signed,
          transformations: optionsRef.current.transformations,
          onProgress: (progress) => {
            updateFile(fileState.id, { progress });
            optionsRef.current.onProgress?.(
              { ...fileState, progress },
              progress,
            );
          },
          registerXhr: (xhr) => xhrRef.current.set(fileState.id, xhr),
        });
        xhrRef.current.delete(fileState.id);
        updateFile(fileState.id, { status: "success", progress: 100, result });
        return result;
      } catch (err) {
        xhrRef.current.delete(fileState.id);
        if (err instanceof DOMException && err.name === "AbortError") {
          updateFile(fileState.id, { status: "aborted" });
          return null;
        }
        const message = err instanceof Error ? err.message : "Upload failed";
        updateFile(fileState.id, { status: "error", error: message });
        optionsRef.current.onError?.({ file: fileState, message });
        return null;
      }
    },
    [resolvedBaseUrl, updateFile],
  );

  const runQueue = React.useCallback(
    async (queue: FileUploadState[], signed: SignedUpload): Promise<UploadedFile[]> => {
      const limit = Math.max(1, concurrency);
      const results: UploadedFile[] = [];
      let cursor = 0;

      async function worker() {
        while (cursor < queue.length) {
          const current = queue[cursor++];
          const result = await uploadOne(current, signed);
          if (result) results.push(result);
        }
      }

      await Promise.all(
        Array.from({ length: Math.min(limit, queue.length) }, worker),
      );
      return results;
    },
    [concurrency, uploadOne],
  );

  const upload = React.useCallback(async (): Promise<UploadedFile[]> => {
    const pending = files.filter(
      (f) => f.status === "idle" || f.status === "aborted",
    );
    if (pending.length === 0) return [];

    if (maxFiles !== undefined && pending.length > maxFiles) {
      const message = `You can upload at most ${maxFiles} file(s)`;
      for (const f of pending) {
        updateFile(f.id, { status: "error", error: message });
      }
      return [];
    }

    setIsUploading(true);
    try {
      const signed = await sign();
      const results = await runQueue(pending, signed);
      if (results.length > 0) optionsRef.current.onSuccess?.(results);
      return results;
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to sign the upload";
      for (const f of pending) {
        updateFile(f.id, { status: "error", error: message });
      }
      return [];
    } finally {
      setIsUploading(false);
    }
  }, [files, sign, maxFiles, runQueue, updateFile]);

  const retry = React.useCallback(
    async (id: string): Promise<UploadedFile | null> => {
      const target = files.find((f) => f.id === id);
      if (!target) return null;
      setIsUploading(true);
      try {
        const signed = await sign();
        const result = await uploadOne(target, signed);
        if (result) optionsRef.current.onSuccess?.([result]);
        return result;
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to sign the upload";
        updateFile(id, { status: "error", error: message });
        return null;
      } finally {
        setIsUploading(false);
      }
    },
    [files, sign, uploadOne, updateFile],
  );

  const abort = React.useCallback((id: string) => {
    const xhr = xhrRef.current.get(id);
    if (xhr) xhr.abort();
  }, []);

  const clear = React.useCallback(() => {
    for (const url of previewUrlsRef.current) URL.revokeObjectURL(url);
    previewUrlsRef.current.clear();
    for (const xhr of xhrRef.current.values()) xhr.abort();
    xhrRef.current.clear();
    setFiles([]);
  }, []);

  return {
    files,
    isUploading,
    addFiles,
    removeFile,
    upload,
    retry,
    abort,
    clear,
  };
}
