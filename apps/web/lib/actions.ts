"use server";

import { getHelloMessage, getMediaFiles, getFolderFiles, uploadFile, deleteFile } from "@/lib/api-client";

export async function fetchHelloMessage(name: string) {
  return await getHelloMessage(name);
}

export async function fetchMediaFiles() {
  return await getMediaFiles();
}

export async function fetchFolderFiles(folderKey: string) {
  return await getFolderFiles(folderKey);
}

export async function uploadFileAction(formData: FormData) {
  try {
    const file = formData.get("file") as File;
    if (!file) {
      return { success: false, error: "Aucun fichier fourni" };
    }

    const result = await uploadFile(file);
    return result;
  } catch (error) {
    console.error("Upload action error:", error);
    return { success: false, error: "Erreur lors de l'upload" };
  }
}

export async function uploadMultipleFilesAction(formData: FormData) {
  try {
    const files = formData.getAll("files") as File[];
    if (!files || files.length === 0) {
      return { success: false, error: "Aucun fichier fourni" };
    }

    console.log("Processing", files.length, "files");

    const results = [];
    const errors = [];
    let successfulUploads = 0;

    for (const file of files) {
      try {
        const result = await uploadFile(file);
        if (result.success) {
          successfulUploads++;
          results.push({ fileName: file.name, success: true, data: result.data });
        } else {
          errors.push({ fileName: file.name, error: result.error || "Upload failed" });
        }
      } catch (error) {
        console.error(`Error uploading ${file.name}:`, error);
        errors.push({ fileName: file.name, error: "Upload failed" });
      }
    }

    return {
      success: successfulUploads > 0,
      data: {
        totalFiles: files.length,
        successfulUploads,
        errors,
        results
      },
      error: successfulUploads === 0 ? "Aucun fichier n'a pu être uploadé" : undefined
    };
  } catch (error) {
    console.error("Multiple upload action error:", error);
    return { success: false, error: "Erreur lors de l'upload des fichiers" };
  }
}

export async function deleteFileAction(key: string) {
  try {
    const result = await deleteFile(key);
    return result;
  } catch (error) {
    console.error("Delete action error:", error);
    return { success: false, error: "Failed to delete file" };
  }
}
