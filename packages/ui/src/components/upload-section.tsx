"use client";

import { Button } from "../ui/button";
import { Spinner } from "../ui/spinner";
import { useQueryClient } from "@tanstack/react-query";
import { useOpeninary } from "../provider/openinary-provider";
import { invalidateStorage } from "../hooks/use-storage-tree";
import { toast } from "sonner";
import {
  CheckCircle2,
  FileImage,
  FileVideo,
  Folder,
  FolderOpen,
  Upload,
  XCircle,
} from "lucide-react";
import { useCallback, useRef, useState } from "react";
import { useDropzone } from "react-dropzone";
import { DEFAULT_ACCEPT, validateFile } from "../file-uploader/use-file-upload";

interface UploadResult {
  filename: string;
  path: string;
  size: number;
  url: string;
}

interface UploadError {
  filename: string;
  error: string;
}

interface UploadResponse {
  success: boolean;
  files?: UploadResult[];
  errors?: UploadError[];
  error?: string;
}

function isIgnoredFile(file: File) {
  const relativePath = (file as File & { webkitRelativePath?: string })
    .webkitRelativePath;
  const name = relativePath
    ? relativePath.split("/").pop() || relativePath
    : file.name;
  return name === ".DS_Store";
}

export function UploadSection({ uploadToFolder }: { uploadToFolder?: string }) {
  const { apiBaseUrl, fetch } = useOpeninary();
  const queryClient = useQueryClient();
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<UploadResponse | null>(null);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const folderInputRef = useRef<HTMLInputElement>(null);

  const onDrop = useCallback((acceptedFiles: File[]) => {
    setSelectedFiles(acceptedFiles.filter((file) => !isIgnoredFile(file)));
    setUploadResult(null);
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    // Mirrors the API's ALLOWED_TYPES. The previous "image/*" / "video/*"
    // wildcards let the picker accept files (svg, tiff, mkv…) the API rejects.
    accept: DEFAULT_ACCEPT,
  });

  const handleFolderSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    // webkitdirectory ignores the input's `accept`, so a folder picked here
    // hands over everything inside it - the dropzone above filters by
    // DEFAULT_ACCEPT, this path did not, and a single stray .txt or .zip made
    // the API reject the whole batch. Size is left to the server (Infinity):
    // this component has no per-plan limit to check against.
    const files = Array.from(e.target.files || []).filter(
      (file) =>
        !isIgnoredFile(file) &&
        validateFile(file, DEFAULT_ACCEPT, Number.POSITIVE_INFINITY) === null,
    );
    if (files.length > 0) {
      setSelectedFiles(files);
      setUploadResult(null);
    }
  };

  const openFolderPicker = () => {
    folderInputRef.current?.click();
  };

  const handleUpload = async () => {
    if (selectedFiles.length === 0) return;

    setUploading(true);
    setUploadResult(null);

    const formData = new FormData();

    if (uploadToFolder) formData.append("folder", uploadToFolder);

    selectedFiles.forEach((file) => {
      formData.append("files", file);
    });

    const fileCount = selectedFiles.length;

    const upload = async () => {
      const response = await fetch(`${apiBaseUrl}/upload`, {
        method: "POST",
        body: formData,
      });

      const data: UploadResponse = await response.json();
      if (!data.success) {
        throw new Error(data.error || "Upload failed");
      }
      return data;
    };

    try {
      const data = await toast.promise(upload(), {
        loading: `Uploading ${fileCount} file(s)...`,
        success: (data) => `Uploaded ${data.files?.length ?? fileCount} file(s)`,
        error: (error) => (error instanceof Error ? error.message : "Upload failed"),
      }).unwrap();

      setUploadResult(data);
      setSelectedFiles([]);
      // Invalidate storage queries to refresh the data
      invalidateStorage(queryClient);
    } catch (error) {
      setUploadResult({
        success: false,
        error: error instanceof Error ? error.message : "Upload failed",
      });
    } finally {
      setUploading(false);
    }
  };

  const formatFileSize = (bytes: number) => {
    return (bytes / 1024 / 1024).toFixed(2) + " MB";
  };

  const getFileIcon = (file: File) => {
    if (file.type.startsWith("image/")) {
      return <FileImage className="h-4 w-4 text-blue-500 dark:text-blue-400" />;
    } else if (file.type.startsWith("video/")) {
      return (
        <FileVideo className="h-4 w-4 text-purple-500 dark:text-purple-400" />
      );
    }
    return <Folder className="h-4 w-4 text-muted-foreground" />;
  };

  return (
    // min-w-0: DefaultDialog's DialogContent is a grid, and a grid child's
    // min-width defaults to its content - one unbreakable filename would
    // otherwise stretch this section wider than the dialog and defeat every
    // `truncate` below, which only ellipsizes once ancestor width is capped.
    <section className="flex-1 min-w-0">
      <div className="space-y-4">
        {/* Hidden folder input */}
        <input
          ref={folderInputRef}
          type="file"
          // @ts-ignore - webkitdirectory is not in the types
          webkitdirectory=""
          directory=""
          multiple
          onChange={handleFolderSelect}
          className="hidden"
        />

        {/* Dropzone */}
        <div
          {...getRootProps()}
          className={`
            relative border-2 border-dashed rounded-lg p-12 text-center cursor-pointer
            transition-all duration-200
            ${
              isDragActive
                ? "border-blue-500 dark:border-blue-400 bg-blue-50/50 dark:bg-blue-950/20"
                : "border-border hover:border-muted-foreground/50 bg-muted/30"
            }
          `}
        >
          <input {...getInputProps()} />
          <div className="flex flex-col items-center gap-4">
            <Upload
              className={`h-12 w-12 ${isDragActive ? "text-blue-500 dark:text-blue-400" : "text-muted-foreground"}`}
            />
            {isDragActive ? (
              <p className="text-lg font-medium text-blue-600 dark:text-blue-400">
                Drop files here...
              </p>
            ) : (
              <>
                <p className="text-lg font-medium">
                  Drop files here, or click to select files
                </p>
                <p className="text-sm text-muted-foreground">
                  Supports: JPG, PNG, WebP, AVIF, GIF, HEIC, PSD, MP4, MOV,
                  WebM
                </p>
                <div className="flex gap-2 mt-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      openFolderPicker();
                    }}
                    className="gap-2"
                  >
                    <FolderOpen className="h-4 w-4" />
                    Select Folder
                  </Button>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Selected Files Preview */}
        {selectedFiles.length > 0 && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold">
                {selectedFiles.length} file(s) selected
              </h3>
              <Button
                onClick={handleUpload}
                disabled={uploading}
                className="gap-2"
              >
                {uploading ? (
                  <>
                    <Spinner size={16} className="text-background" />
                    Uploading...
                  </>
                ) : (
                  <>
                    <Upload className="h-4 w-4" />
                    Upload Files
                  </>
                )}
              </Button>
            </div>

            <div className="rounded-lg border overflow-hidden">
              <div className="scroll-fade divide-y max-h-64 overflow-y-auto">
                {selectedFiles.slice(0, 50).map((file, index) => {
                  const displayPath =
                    (file as any).webkitRelativePath || file.name;
                  return (
                    <div
                      key={index}
                      className="flex items-center gap-3 px-4 py-3 bg-card hover:bg-muted/50"
                    >
                      {getFileIcon(file)}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">
                          {displayPath}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {formatFileSize(file.size)}
                        </p>
                      </div>
                    </div>
                  );
                })}
                {selectedFiles.length > 50 && (
                  <div className="px-4 py-3 text-center text-sm text-muted-foreground">
                    ... and {selectedFiles.length - 50} more files
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Upload Results */}
        {uploadResult && (
          <div className="space-y-4">
            {uploadResult.success &&
              uploadResult.files &&
              uploadResult.files.length > 0 && (
                <div className="border border-green-200 dark:border-green-800 rounded-lg p-4 bg-green-50 dark:bg-green-950/20">
                  <div className="flex items-center gap-2 mb-3">
                    <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400" />
                    <h3 className="font-semibold text-green-900 dark:text-green-100">
                      Successfully uploaded {uploadResult.files.length} file(s)
                    </h3>
                  </div>
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {uploadResult.files.map((file, index) => (
                      <div
                        key={index}
                        className="flex items-center justify-between p-3 bg-card rounded border border-green-100 dark:border-green-900/50"
                      >
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">
                            {file.path}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {formatFileSize(file.size)}
                          </p>
                        </div>
                        <a
                          href={`${apiBaseUrl}${file.url}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 font-medium ml-4"
                        >
                          View
                        </a>
                      </div>
                    ))}
                  </div>
                </div>
              )}

            {uploadResult.errors && uploadResult.errors.length > 0 && (
              <div className="border border-red-200 dark:border-red-800 rounded-lg p-4 bg-red-50 dark:bg-red-950/20">
                <div className="flex items-center gap-2 mb-3">
                  <XCircle className="h-5 w-5 text-red-600 dark:text-red-400" />
                  <h3 className="font-semibold text-red-900 dark:text-red-100">
                    {uploadResult.errors.length} file(s) failed
                  </h3>
                </div>
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {uploadResult.errors.map((error, index) => (
                    <div
                      key={index}
                      className="p-3 bg-card rounded border border-red-100 dark:border-red-900/50"
                    >
                      <p className="text-sm font-medium text-red-900 dark:text-red-100">
                        {error.filename}
                      </p>
                      <p className="text-xs text-red-700 dark:text-red-300 mt-1">
                        {error.error}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {uploadResult.error && !uploadResult.success && (
              <div className="border border-red-200 dark:border-red-800 rounded-lg p-4 bg-red-50 dark:bg-red-950/20">
                <div className="flex items-center gap-2">
                  <XCircle className="h-5 w-5 text-red-600 dark:text-red-400" />
                  <p className="font-semibold text-red-900 dark:text-red-100">
                    Upload failed
                  </p>
                </div>
                <p className="text-sm text-red-700 dark:text-red-300 mt-2">
                  {uploadResult.error}
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
