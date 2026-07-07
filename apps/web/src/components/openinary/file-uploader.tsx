"use client";

import * as React from "react";
import {
  AlertCircle,
  CheckCircle2,
  File as FileIcon,
  Film,
  ImageIcon,
  RotateCw,
  UploadCloud,
  X,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  DEFAULT_ACCEPT,
  DEFAULT_MAX_SIZE,
  useFileUpload,
  type FileUploadState,
  type SignedUpload,
  type UploadFileError,
  type UploadedFile,
} from "@/components/openinary/use-file-upload";

export interface FileUploaderProps {
  /** Base URL of the Openinary API, e.g. https://media.example.com. Falls back to NEXT_PUBLIC_OPENINARY_URL. */
  baseUrl?: string;
  /**
   * Returns a presigned upload signature from your backend (which calls
   * `POST /upload/sign` with an Openinary API key). Called before each upload
   * batch and on retry. The upload's destination folder is whatever the
   * signature is scoped to.
   */
  sign: () => Promise<SignedUpload> | SignedUpload;
  /** Allow selecting multiple files. Default true. */
  multiple?: boolean;
  /** Accepted MIME types mapped to extensions. Defaults to the Openinary media types. */
  accept?: Record<string, string[]>;
  /** Max file size in bytes. Default 50MB. */
  maxSize?: number;
  /** Client-side cap on the number of files. Not enforced by the server. */
  maxFiles?: number;
  /** Transformation segments to pre-warm, e.g. ["w_800,f_webp"]. */
  transformations?: string[];
  /** Upload automatically as soon as files are added. Default false. */
  autoUpload?: boolean;
  disabled?: boolean;
  className?: string;
  onSuccess?: (files: UploadedFile[]) => void;
  onError?: (error: UploadFileError) => void;
  onProgress?: (file: FileUploadState, progress: number) => void;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function acceptAttribute(accept: Record<string, string[]>): string {
  return Array.from(new Set(Object.values(accept).flat())).join(",");
}

function FileThumbnail({ file }: { file: FileUploadState }) {
  if (file.previewUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={file.previewUrl}
        alt={file.name}
        className="size-10 shrink-0 rounded-md object-cover"
      />
    );
  }
  const Icon = file.file.type.startsWith("video/")
    ? Film
    : file.file.type.startsWith("image/")
      ? ImageIcon
      : FileIcon;
  return (
    <div className="flex size-10 shrink-0 items-center justify-center rounded-md bg-muted">
      <Icon className="size-5 text-muted-foreground" />
    </div>
  );
}

export function FileUploader({
  baseUrl,
  sign,
  multiple = true,
  accept = DEFAULT_ACCEPT,
  maxSize = DEFAULT_MAX_SIZE,
  maxFiles,
  transformations,
  autoUpload = false,
  disabled = false,
  className,
  onSuccess,
  onError,
  onProgress,
}: FileUploaderProps) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = React.useState(false);

  const { files, isUploading, addFiles, removeFile, upload, retry, abort, clear } =
    useFileUpload({
      baseUrl,
      sign,
      multiple,
      accept,
      maxSize,
      maxFiles,
      transformations,
      onSuccess,
      onError,
      onProgress,
    });

  const handleFiles = React.useCallback(
    (list: FileList | File[]) => {
      const added = addFiles(list);
      if (autoUpload && added.some((f) => f.status === "idle")) {
        // Defer so state has settled before uploading.
        setTimeout(() => void upload(), 0);
      }
    },
    [addFiles, autoUpload, upload],
  );

  const openPicker = React.useCallback(() => {
    if (!disabled) inputRef.current?.click();
  }, [disabled]);

  const onDrop = React.useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      setIsDragging(false);
      if (disabled) return;
      if (event.dataTransfer.files?.length) {
        handleFiles(event.dataTransfer.files);
      }
    },
    [disabled, handleFiles],
  );

  const hasPending = files.some(
    (f) => f.status === "idle" || f.status === "aborted",
  );

  return (
    <div className={cn("flex w-full flex-col gap-4", className)}>
      <div
        role="button"
        tabIndex={disabled ? -1 : 0}
        aria-disabled={disabled}
        aria-label="Upload files. Click to browse or drop files here."
        onClick={openPicker}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            openPicker();
          }
        }}
        onDragOver={(e) => {
          e.preventDefault();
          if (!disabled) setIsDragging(true);
        }}
        onDragLeave={(e) => {
          e.preventDefault();
          setIsDragging(false);
        }}
        onDrop={onDrop}
        className={cn(
          "flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-input px-6 py-10 text-center transition-colors",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
          isDragging && "border-primary bg-accent",
          disabled
            ? "cursor-not-allowed opacity-60"
            : "cursor-pointer hover:bg-accent/50",
        )}
      >
        <UploadCloud className="size-8 text-muted-foreground" />
        <div className="text-sm font-medium">
          Drag &amp; drop files here, or{" "}
          <span className="text-primary underline underline-offset-4">browse</span>
        </div>
        <p className="text-xs text-muted-foreground">
          Up to {formatBytes(maxSize)} per file
          {maxFiles ? ` · max ${maxFiles} file${maxFiles > 1 ? "s" : ""}` : ""}
        </p>
        <input
          ref={inputRef}
          type="file"
          className="sr-only"
          multiple={multiple}
          accept={acceptAttribute(accept)}
          disabled={disabled}
          onChange={(e) => {
            if (e.target.files?.length) handleFiles(e.target.files);
            e.target.value = "";
          }}
        />
      </div>

      {files.length > 0 && (
        <ul className="flex flex-col gap-2">
          {files.map((file) => (
            <li
              key={file.id}
              className="flex items-center gap-3 rounded-md border border-border bg-card p-3"
            >
              <FileThumbnail file={file} />

              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm font-medium">{file.name}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {formatBytes(file.size)}
                  </span>
                </div>

                {file.status === "uploading" && (
                  <Progress value={file.progress} className="h-1.5" />
                )}

                {file.status === "error" && (
                  <span className="flex items-center gap-1 text-xs text-destructive">
                    <AlertCircle className="size-3" />
                    {file.error}
                  </span>
                )}

                {file.status === "success" && (
                  <span className="flex items-center gap-1 text-xs text-muted-foreground">
                    <CheckCircle2 className="size-3 text-green-600" />
                    Uploaded
                  </span>
                )}

                {file.status === "aborted" && (
                  <span className="text-xs text-muted-foreground">Cancelled</span>
                )}
              </div>

              <div className="flex shrink-0 items-center gap-1">
                {file.status === "uploading" ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-8"
                    aria-label="Cancel upload"
                    onClick={() => abort(file.id)}
                  >
                    <X className="size-4" />
                  </Button>
                ) : (
                  <>
                    {file.status === "error" && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="size-8"
                        aria-label="Retry upload"
                        onClick={() => void retry(file.id)}
                      >
                        <RotateCw className="size-4" />
                      </Button>
                    )}
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="size-8"
                      aria-label="Remove file"
                      onClick={() => removeFile(file.id)}
                    >
                      <X className="size-4" />
                    </Button>
                  </>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {files.length > 0 && !autoUpload && (
        <div className="flex items-center justify-end gap-2">
          <Button
            type="button"
            variant="ghost"
            onClick={clear}
            disabled={isUploading}
          >
            Clear
          </Button>
          <Button
            type="button"
            onClick={() => void upload()}
            disabled={disabled || isUploading || !hasPending}
          >
            {isUploading ? "Uploading…" : "Upload"}
          </Button>
        </div>
      )}
    </div>
  );
}
