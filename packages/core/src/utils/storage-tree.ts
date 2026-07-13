export type StorageNode = {
  name: string;
  path: string;
  type: "file" | "directory";
  size?: number;
  mtime?: string;
  children?: StorageNode[];
};

export type TreeDataItem = {
  id: string;
  name: string;
  size?: number;
  mtime?: string;
  children?: TreeDataItem[];
  draggable?: boolean;
  droppable?: boolean;
  disabled?: boolean;
};

export type ListedObject = {
  key: string;
  size?: number;
  lastModified?: Date;
};

export function buildTreeFromKeys(keys: ListedObject[]): StorageNode {
  const root: StorageNode = {
    name: "storage",
    path: "",
    type: "directory",
    children: [],
  };

  // Path-indexed lookups keep tree construction linear in the number of keys
  const dirByPath = new Map<string, StorageNode>([["", root]]);
  const filePaths = new Set<string>();

  const ensureDir = (dirPath: string): StorageNode => {
    const existing = dirByPath.get(dirPath);
    if (existing) {
      return existing;
    }

    const slashIndex = dirPath.lastIndexOf("/");
    const parent = ensureDir(slashIndex === -1 ? "" : dirPath.slice(0, slashIndex));
    const dirNode: StorageNode = {
      name: dirPath.slice(slashIndex + 1),
      path: dirPath,
      type: "directory",
      children: [],
    };
    parent.children = parent.children || [];
    parent.children.push(dirNode);
    dirByPath.set(dirPath, dirNode);
    return dirNode;
  };

  for (const { key, size, lastModified } of keys) {
    const normalizedKey = key.replace(/^\/+/, "");
    const isFolderMarker = normalizedKey.endsWith("/");
    const parts = normalizedKey.split("/").filter(Boolean);

    if (parts.length === 0) {
      continue;
    }

    const fullPath = parts.join("/");

    if (isFolderMarker) {
      ensureDir(fullPath);
      continue;
    }

    const parent = ensureDir(parts.slice(0, -1).join("/"));

    if (filePaths.has(fullPath)) {
      continue;
    }
    filePaths.add(fullPath);

    parent.children = parent.children || [];
    parent.children.push({
      name: parts[parts.length - 1],
      path: fullPath,
      type: "file",
      size,
      mtime: lastModified?.toISOString(),
    });
  }

  return root;
}

export function storageTreeToTreeData(root: StorageNode): TreeDataItem[] {
  if (!root.children) return [];

  const mapNode = (node: StorageNode): TreeDataItem => {
    return {
      id: node.path || node.name,
      name: node.name || node.path,
      size: node.size,
      mtime: node.mtime,
      children: node.children?.map(mapNode),
    };
  };

  return root.children.map(mapNode);
}

export function sumTreeSize(node: StorageNode): {
  size: number;
  fileCount: number;
} {
  let size = node.size ?? 0;
  let fileCount = node.type === "file" ? 1 : 0;

  for (const child of node.children ?? []) {
    const childStats = sumTreeSize(child);
    size += childStats.size;
    fileCount += childStats.fileCount;
  }

  return { size, fileCount };
}
