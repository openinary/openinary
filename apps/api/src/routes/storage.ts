import { Hono } from "hono";
import { createStorageClient } from "../utils/storage";
import fs from "fs";
import path from "path";
import logger from "../utils/logger";

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
      // List only objects in the public/ folder
      const objects = await storageClient.list("public/");
      
      // Remove the public/ prefix from all keys
      const publicObjects = objects
        .filter(obj => obj.key.startsWith("public/"))
        .map(obj => ({
          ...obj,
          key: obj.key.substring(7) // Remove "public/" prefix (7 characters)
        }));
      
      root = buildTreeFromKeys(publicObjects);
    } else {
      const publicDir = path.join(".", "public");
      root = buildLocalTree(publicDir);
    }

    const treeData = storageTreeToTreeData(root);

    return c.json(treeData);
  } catch (error) {
    logger.error({ error }, "Failed to list storage contents");
    return c.json(
      {
        error: "Failed to list storage contents",
      },
      500
    );
  }
});

/**
 * Delete a file from storage
 * DELETE /storage/*
 */
storageRoute.delete("/*", async (c) => {
  const requestPath = c.req.path;
  
  // Remove '/storage' prefix from the path
  // requestPath will be something like '/storage/cows/black.png'
  // We need to extract 'cows/black.png'
  const pathWithoutPrefix = requestPath.replace(/^\/storage\/?/, "");
  
  if (!pathWithoutPrefix) {
    return c.json(
      {
        error: "Bad request",
        message: "File path is required",
      },
      400
    );
  }

  let filePath = pathWithoutPrefix.replace(/^\/+/, "").replace(/\/+$/, "");
  
  try {
    filePath = decodeURIComponent(filePath);
  } catch (error) {
    // If decoding fails, use the original path
  }

  try {
    if (storageClient) {
      const exists = await storageClient.existsOriginal(filePath);
      if (!exists) {
        return c.json(
          {
            error: "Not found",
            message: "File not found",
          },
          404
        );
      }
      
      await storageClient.deleteOriginal(filePath);
    } else {
      const localPath = path.join(".", "public", filePath);
      
      if (!fs.existsSync(localPath)) {
        return c.json(
          {
            error: "Not found",
            message: "File not found",
          },
          404
        );
      }

      const stats = fs.statSync(localPath);
      if (stats.isDirectory()) {
        return c.json(
          {
            error: "Bad request",
            message: "Cannot delete directories",
          },
          400
        );
      }

      fs.unlinkSync(localPath);
    }

    return c.json({
      success: true,
      message: "File deleted successfully",
    });
  } catch (error) {
    logger.error({ error, filePath }, "Failed to delete file");
    return c.json(
      {
        error: "Internal server error",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      500
    );
  }
});

export default storageRoute;

