"use client";

import { useCallback, useState, useRef } from "react";
import { useDropzone } from "react-dropzone";
import { useQueryClient } from "@tanstack/react-query";
import { Upload, FileImage, FileVideo, Folder, CheckCircle2, XCircle, Loader2, FolderOpen } from "lucide-react";
import { Button } from "@/components/ui/button";

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

export function UploadSection() {
  const queryClient = useQueryClient();
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<UploadResponse | null>(null);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const folderInputRef = useRef<HTMLInputElement>(null);

  const onDrop = useCallback((acceptedFiles: File[]) => {
    setSelectedFiles(acceptedFiles);
    setUploadResult(null);
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      "image/*": [".jpg", ".jpeg", ".png", ".webp", ".avif", ".gif"],
      "video/*": [".mp4", ".mov", ".webm"],
    },
  });

  const handleFolderSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
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
    selectedFiles.forEach((file) => {
      formData.append("files", file);
    });

    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:3000";
      const response = await fetch(`${apiUrl}/upload`, {
        method: "POST",
        body: formData,
        credentials: 'include',
      });

      const data: UploadResponse = await response.json();
      setUploadResult(data);

      if (data.success) {
        setSelectedFiles([]);
        // Invalidate storage tree query to refresh the data
        queryClient.invalidateQueries({ queryKey: ["storage-tree"] });
      }
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
      return <FileVideo className="h-4 w-4 text-purple-500 dark:text-purple-400" />;
    }
    return <Folder className="h-4 w-4 text-muted-foreground" />;
  };

  return (
    <section className="flex-1">
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
            <Upload className={`h-12 w-12 ${isDragActive ? "text-blue-500 dark:text-blue-400" : "text-muted-foreground"}`} />
            {isDragActive ? (
              <p className="text-lg font-medium text-blue-600 dark:text-blue-400">Drop files here...</p>
            ) : (
              <>
                <p className="text-lg font-medium">
                  Drop files here, or click to select files
                </p>
                <p className="text-sm text-muted-foreground">
                  Supports: JPG, PNG, WebP, AVIF, GIF, MP4, MOV, WebM
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
                    <Loader2 className="h-4 w-4 animate-spin" />
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

            <div className="border rounded-lg divide-y max-h-64 overflow-y-auto">
              {selectedFiles.slice(0, 50).map((file, index) => {
                const displayPath = (file as any).webkitRelativePath || file.name;
                return (
                  <div
                    key={index}
                    className="flex items-center gap-3 px-4 py-3 bg-card hover:bg-muted/50"
                  >
                    {getFileIcon(file)}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{displayPath}</p>
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
        )}

        {/* Upload Results */}
        {uploadResult && (
          <div className="space-y-4">
            {uploadResult.success && uploadResult.files && uploadResult.files.length > 0 && (
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
                        <p className="text-sm font-medium truncate">{file.path}</p>
                        <p className="text-xs text-muted-foreground">
                          {formatFileSize(file.size)}
                        </p>
                      </div>
                      <a
                        href={`${process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:3000"}${file.url}`}
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
                      <p className="text-xs text-red-700 dark:text-red-300 mt-1">{error.error}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {uploadResult.error && !uploadResult.success && (
              <div className="border border-red-200 dark:border-red-800 rounded-lg p-4 bg-red-50 dark:bg-red-950/20">
                <div className="flex items-center gap-2">
                  <XCircle className="h-5 w-5 text-red-600 dark:text-red-400" />
                  <p className="font-semibold text-red-900 dark:text-red-100">Upload failed</p>
                </div>
                <p className="text-sm text-red-700 dark:text-red-300 mt-2">{uploadResult.error}</p>
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

