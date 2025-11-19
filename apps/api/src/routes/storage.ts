import { Hono } from "hono";
import { createStorageClient } from "../utils/storage";
import fs from "fs";
import path from "path";

type StorageNode = {
  name: string;
  path: string;
  type: "file" | "directory";
  children?: StorageNode[];
};

type TreeDataItem = {
  id: string;
  name: string;
  children?: TreeDataItem[];
  draggable?: boolean;
  droppable?: boolean;
  disabled?: boolean;
};

const storageRoute = new Hono();
const storageClient = createStorageClient();

function buildLocalTree(rootDir: string): StorageNode {
  const root: StorageNode = {
    name: "storage",
    path: "",
    type: "directory",
    children: [],
  };

  if (!fs.existsSync(rootDir)) {
    return root;
  }

  const walk = (absoluteDir: string, relativeDir: string, parent: StorageNode) => {
    const entries = fs.readdirSync(absoluteDir, { withFileTypes: true });

    for (const entry of entries) {
      const relPath = relativeDir ? `${relativeDir}/${entry.name}` : entry.name;
      const fullPath = path.join(absoluteDir, entry.name);

      if (entry.isDirectory()) {
        const dirNode: StorageNode = {
          name: entry.name,
          path: relPath,
          type: "directory",
          children: [],
        };
        parent.children = parent.children || [];
        parent.children.push(dirNode);
        walk(fullPath, relPath, dirNode);
      } else if (entry.isFile()) {
        const fileNode: StorageNode = {
          name: entry.name,
          path: relPath,
          type: "file",
        };
        parent.children = parent.children || [];
        parent.children.push(fileNode);
      }
    }
  };

  walk(rootDir, "", root);
  return root;
}

function buildTreeFromKeys(keys: { key: string }[]): StorageNode {
  const root: StorageNode = {
    name: "storage",
    path: "",
    type: "directory",
    children: [],
  };

  for (const { key } of keys) {
    const parts = key.split("/").filter(Boolean);
    let current = root;
    let currentPath = "";

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      currentPath = currentPath ? `${currentPath}/${part}` : part;
      const isFile = i === parts.length - 1;

      if (isFile) {
        current.children = current.children || [];
        const existing = current.children.find(
          (child) => child.name === part && child.type === "file"
        );
        if (!existing) {
          current.children.push({
            name: part,
            path: currentPath,
            type: "file",
          });
        }
      } else {
        current.children = current.children || [];
        let dirNode = current.children.find(
          (child) => child.name === part && child.type === "directory"
        );
        if (!dirNode) {
          dirNode = {
            name: part,
            path: currentPath,
            type: "directory",
            children: [],
          };
          current.children.push(dirNode);
        }
        current = dirNode;
      }
    }
  }

  return root;
}

function storageTreeToTreeData(root: StorageNode): TreeDataItem[] {
  if (!root.children) return [];

  const mapNode = (node: StorageNode): TreeDataItem => {
    return {
      id: node.path || node.name,
      name: node.name || node.path,
      children: node.children?.map(mapNode),
    };
  };

  return root.children.map(mapNode);
}

storageRoute.get("/", async (c) => {
  try {
    let root: StorageNode;

    if (storageClient) {
      const objects = await storageClient.list();
      root = buildTreeFromKeys(objects);
    } else {
      const publicDir = path.join(".", "public");
      root = buildLocalTree(publicDir);
    }

    const treeData = storageTreeToTreeData(root);

    return c.json(treeData);
  } catch (error) {
    console.error("Failed to list storage contents:", error);
    return c.json(
      {
        error: "Failed to list storage contents",
      },
      500
    );
  }
});

export default storageRoute;

