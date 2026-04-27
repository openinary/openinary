export type MediaFile = {
  id: string;
  name: string;
  path: string;
  type: "image" | "video";
};

export type FolderItem = {
  id: string;
  name: string;
  path: string;
};

export type MediaRow = {
  id: string;
  name: string;
  path: string;
  rowType: "folder" | "image" | "video";
};

export type ViewMode = "grid" | "list";
