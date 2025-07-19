"use client";

import { toast } from "sonner";
import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";

import {
  AlertCircleIcon,
  FileArchiveIcon,
  FileIcon,
  FileSpreadsheetIcon,
  FileTextIcon,
  HeadphonesIcon,
  ImageIcon,
  Trash2Icon,
  UploadIcon,
  VideoIcon,
  XIcon,
} from "lucide-react";

import { formatBytes, useFileUpload } from "../hooks/use-file-upload";

import {
  Dialog,
  DialogContent,
  DialogTrigger,
} from "@repo/ui/components/ui/dialog";
import { Button } from "@repo/ui/components/ui/button";

interface UploadButtonProps {
  uploadAction?: (
    formData: FormData,
  ) => Promise<{ success: boolean; error?: string; data?: any }>;
  onUploadSuccess?: () => void;
}

const getFileIcon = (file: { file: File | { type: string; name: string } }) => {
  const fileType = file.file instanceof File ? file.file.type : file.file.type;
  const fileName = file.file instanceof File ? file.file.name : file.file.name;

  if (
    fileType.includes("pdf") ||
    fileName.endsWith(".pdf") ||
    fileType.includes("word") ||
    fileName.endsWith(".doc") ||
    fileName.endsWith(".docx")
  ) {
    return <FileTextIcon className="size-4 opacity-60" />;
  } else if (
    fileType.includes("zip") ||
    fileType.includes("archive") ||
    fileName.endsWith(".zip") ||
    fileName.endsWith(".rar")
  ) {
    return <FileArchiveIcon className="size-4 opacity-60" />;
  } else if (
    fileType.includes("excel") ||
    fileName.endsWith(".xls") ||
    fileName.endsWith(".xlsx")
  ) {
    return <FileSpreadsheetIcon className="size-4 opacity-60" />;
  } else if (fileType.includes("video/")) {
    return <VideoIcon className="size-4 opacity-60" />;
  } else if (fileType.includes("audio/")) {
    return <HeadphonesIcon className="size-4 opacity-60" />;
  } else if (fileType.startsWith("image/")) {
    return <ImageIcon className="size-4 opacity-60" />;
  }
  return <FileIcon className="size-4 opacity-60" />;
};

const initialFiles: any[] = [];

export default function UploadButton({
  uploadAction,
  onUploadSuccess,
}: UploadButtonProps) {
  const [isUploading, setIsUploading] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const selectFilesButtonRef = useRef<HTMLButtonElement>(null);
  const queryClient = useQueryClient();
  const maxSize = 10 * 1024 * 1024; // 10MB default
  const maxFiles = 10;

  const [
    { files, isDragging, errors },
    {
      handleDragEnter,
      handleDragLeave,
      handleDragOver,
      handleDrop,
      openFileDialog,
      removeFile,
      clearFiles,
      getInputProps,
    },
  ] = useFileUpload({
    multiple: true,
    maxFiles,
    maxSize,
    initialFiles,
  });

  // Nouvelle fonction pour gérer l'upload multiple
  const handleMultipleFilesUpload = async () => {
    if (!uploadAction) {
      toast.error("Upload action not provided");
      return;
    }

    if (files.length === 0) {
      toast.error("Aucun fichier sélectionné");
      return;
    }

    console.log("Starting upload with files:", files.length);

    setIsUploading(true);

    // Afficher le toast de chargement
    const loadingToastId = toast.loading(
      `Upload de ${files.length} fichier(s) en cours...`,
      {
        duration: Infinity,
      },
    );

    try {
      const formData = new FormData();

      // Ajouter tous les fichiers au FormData
      files.forEach((fileItem, index) => {
        if (fileItem.file instanceof File) {
          console.log(
            `Adding file ${index + 1}:`,
            fileItem.file.name,
            fileItem.file.size,
          );
          formData.append("files", fileItem.file);
        }
      });

      // Debug: vérifier le contenu du FormData
      console.log("FormData entries:");
      for (const [key, value] of formData.entries()) {
        console.log(
          key,
          value instanceof File
            ? `File: ${value.name} (${value.size} bytes)`
            : value,
        );
      }

      const result = await uploadAction(formData);
      console.log("Upload result:", result);

      // Fermer le toast de chargement
      toast.dismiss(loadingToastId);

      if (result.success) {
        // Invalidate and refetch media files
        queryClient.invalidateQueries({ queryKey: ["media-files"] });

        // Toast de succès
        if (result.data?.totalFiles) {
          toast.success(
            `${result.data.successfulUploads}/${result.data.totalFiles} fichier(s) uploadé(s) avec succès !`,
          );

          // Afficher les erreurs s'il y en a
          if (result.data.errors && result.data.errors.length > 0) {
            result.data.errors.forEach((error: any) => {
              toast.error(`Erreur pour ${error.fileName}: ${error.error}`);
            });
          }
        } else {
          toast.success(`Fichier uploadé avec succès !`);
        }

        // Vider la liste des fichiers et fermer le dialogue
        clearFiles();
        setIsDialogOpen(false);
        onUploadSuccess?.();
      } else {
        // Toast d'erreur
        console.error("Upload failed:", result.error);
        toast.error(result.error || "Échec de l'upload");
      }
    } catch (error) {
      // Fermer le toast de chargement en cas d'erreur
      toast.dismiss(loadingToastId);
      console.error("Upload error:", error);
      toast.error("Échec de l'upload. Veuillez réessayer.");
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <>
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <form>
          <DialogTrigger asChild>
            <Button variant="outline">Upload Files</Button>
          </DialogTrigger>
          <DialogContent
            showCloseButton={false}
            className="p-0 border-0 sm:max-w-[450px]"
          >
            <div className="flex flex-col gap-2">
              {/* Drop area */}
              <div
                onDragEnter={handleDragEnter}
                onDragLeave={handleDragLeave}
                onDragOver={handleDragOver}
                onDrop={handleDrop}
                data-dragging={isDragging || undefined}
                data-files={files.length > 0 || undefined}
                className="border-input py-10 data-[dragging=true]:bg-accent/50 has-[input:focus]:border-ring has-[input:focus]:ring-ring/50 flex flex-col items-center rounded-xl border border-dashed p-4 transition-colors not-data-[files]:justify-center has-[input:focus]:ring-[3px]"
              >
                <input
                  {...getInputProps()}
                  className="sr-only"
                  aria-label="Upload files"
                />

                {files.length > 0 ? (
                  <div className="flex w-full flex-col gap-3">
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="truncate text-sm font-medium">
                        Uploaded Files ({files.length})
                      </h3>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={clearFiles}
                        disabled={isUploading}
                      >
                        <Trash2Icon
                          className="-ms-0.5 mr-1 size-3.5 opacity-60"
                          aria-hidden="true"
                        />
                        Remove all
                      </Button>
                    </div>
                    <div className="w-full space-y-2">
                      {files.map((file) => (
                        <div
                          key={file.id}
                          className="bg-background flex items-center justify-between gap-2 rounded-lg border p-2 pe-3"
                        >
                          <div className="flex items-center gap-3 overflow-hidden">
                            <div className="flex aspect-square size-10 shrink-0 items-center justify-center rounded border">
                              {getFileIcon(file)}
                            </div>
                            <div className="flex min-w-0 flex-col gap-0.5">
                              <p className="truncate text-[13px] font-medium">
                                {file.file instanceof File
                                  ? file.file.name
                                  : file.file.name}
                              </p>
                              <p className="text-muted-foreground text-xs">
                                {formatBytes(
                                  file.file instanceof File
                                    ? file.file.size
                                    : file.file.size,
                                )}
                              </p>
                            </div>
                          </div>

                          <Button
                            size="icon"
                            variant="ghost"
                            className="text-muted-foreground/80 hover:text-foreground -me-2 size-8 hover:bg-transparent"
                            onClick={() => removeFile(file.id)}
                            aria-label="Remove file"
                            disabled={isUploading}
                          >
                            <XIcon className="size-4" aria-hidden="true" />
                          </Button>
                        </div>
                      ))}

                      {files.length < maxFiles && (
                        <>
                          <Button
                            variant="ghost"
                            className="mt-2 w-full"
                            onClick={openFileDialog}
                            disabled={isUploading}
                          >
                            Add more
                          </Button>
                          <Button
                            variant="default"
                            className="mt-2 w-full"
                            onClick={handleMultipleFilesUpload}
                            disabled={isUploading}
                          >
                            {isUploading ? (
                              <>
                                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />
                                Uploading...
                              </>
                            ) : (
                              <>
                                <UploadIcon className="-ms-1 mr-2 size-4" />
                                Send ({files.length})
                              </>
                            )}
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center text-center">
                    <div
                      className="bg-background mb-2 flex size-11 shrink-0 items-center justify-center rounded-full border"
                      aria-hidden="true"
                    >
                      <FileIcon className="size-4 opacity-60" />
                    </div>
                    <p className="mb-1.5 text-sm font-medium">Upload files</p>
                    <p className="text-muted-foreground text-xs">
                      Max {maxFiles} files ∙ Up to {formatBytes(maxSize)} each
                    </p>
                    <Button
                      autoFocus
                      variant="outline"
                      className="mt-4"
                      onClick={openFileDialog}
                      disabled={isUploading}
                      ref={selectFilesButtonRef}
                    >
                      <UploadIcon
                        className="-ms-1 mr-2 opacity-60"
                        aria-hidden="true"
                      />
                      Select files
                    </Button>
                  </div>
                )}
              </div>

              {errors.length > 0 && (
                <div
                  className="text-destructive flex items-center gap-1 text-xs"
                  role="alert"
                >
                  <AlertCircleIcon className="size-3 shrink-0" />
                  <span>{errors[0]}</span>
                </div>
              )}
            </div>
          </DialogContent>
        </form>
      </Dialog>
    </>
  );
}
