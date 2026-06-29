import type { TreeDataItem } from "@/components/ui/tree-view";
import { IMAGE_EXTENSIONS, VIDEO_EXTENSIONS } from "./constants";
import type { FolderItem, MediaFile } from "./types";

export function isImageFile(name: string): boolean {
  const lower = name.toLowerCase();
  return IMAGE_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

export function isVideoFile(name: string): boolean {
  const lower = name.toLowerCase();
  return VIDEO_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

export function getFolderInitials(name: string): string {
  const words = name.trim().split(/\s+/);
  if (words.length === 1) return name.slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

export function getFolderImages(
  items: TreeDataItem[],
  folderPath: string[],
  limit = 4,
): string[] {
  let currentItems = items;
  for (const seg of folderPath) {
    const found = currentItems.find((i) => i.name === seg);
    if (!found?.children) return [];
    currentItems = found.children;
  }
  const images: string[] = [];
  for (const item of currentItems) {
    if (images.length >= limit) break;
    if (!item.children && isImageFile(item.name)) {
      images.push([...folderPath, item.name].join("/"));
    }
  }
  return images;
}

export function findItemsInPath(
  items: TreeDataItem[],
  targetPath: string[],
): { folders: FolderItem[]; files: MediaFile[] } {
  const folders: FolderItem[] = [];
  const files: MediaFile[] = [];

  let currentItems = items;
  for (const segment of targetPath) {
    const found = currentItems.find((item) => item.name === segment);
    if (!found?.children) return { folders, files };
    currentItems = found.children;
  }

  for (const item of currentItems) {
    const itemPath =
      targetPath.length > 0
        ? `${targetPath.join("/")}/${item.name}`
        : item.name;

    if (item.children) {
      folders.push({ id: item.id, name: item.name, path: itemPath });
    } else if (isImageFile(item.name)) {
      files.push({ id: item.id, name: item.name, path: itemPath, type: "image" });
    } else if (isVideoFile(item.name)) {
      files.push({ id: item.id, name: item.name, path: itemPath, type: "video" });
    }
  }

  folders.sort((a, b) => a.name.localeCompare(b.name));
  files.sort((a, b) => a.name.localeCompare(b.name));

  return { folders, files };
}
