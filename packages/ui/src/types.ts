export type MediaType = "image" | "video";

export type MediaFile = {
  id: string;
  name: string;
  path: string;
  type: MediaType;
};

export type StorageFolder = {
  name: string;
  path: string;
};

export type StorageFile = {
  id: string;
  name: string;
  path: string;
  type: MediaType;
  size?: number;
  mtime?: string;
};

export type StorageLevel = {
  path: string;
  folders: StorageFolder[];
  files: StorageFile[];
};
