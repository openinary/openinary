import { TreeDataItem } from "@/components/ui/tree-view";

const MediaHelper = {
  getFolderInitials: (name: string): string => {
    const words = name.trim().split(/\s+/);
    if (words.length === 1) return name.slice(0, 2).toUpperCase();
    return (words[0][0] + words[1][0]).toUpperCase();
  },

  getFolderImages: (
    items: TreeDataItem[],
    folderPath: string[],
    limit = 4,
  ): string[] => {
    let currentItems = items;
    for (const seg of folderPath) {
      const found = currentItems.find((i) => i.name === seg);
      if (!found?.children) return [];
      currentItems = found.children;
    }
    const images: string[] = [];
    for (const item of currentItems) {
      if (images.length >= limit) break;
      if (!item.children) {
        const lower = item.name.toLowerCase();
        const isImage = [
          ".jpg",
          ".jpeg",
          ".png",
          ".webp",
          ".gif",
          ".avif",
          ".psd",
        ].some((ext) => lower.endsWith(ext));
        if (isImage) {
          images.push([...folderPath, item.name].join("/"));
        }
      }
    }
    return images;
  },
};

export default MediaHelper;
