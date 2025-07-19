export interface MediaFile {
  type: "file";
  key: string;
  size: number;
  etag: string;
  uploaded: string;
  url: string;
  customMetadata?: Record<string, string>;
}

export interface MediaFolder {
  type: "folder";
  key: string;
  name: string;
}

export type MediaItem = MediaFile | MediaFolder;

export interface MediaLibraryProps {
  endpointSearch?: string;
  isLoading?: boolean;
  mediaResult?: {
    success: boolean;
    data:
      | {
          bucket: string;
          items: MediaItem[];
          truncated: boolean;
        }
      | { error: string }
      | null;
  };
  onFileDeleted?: () => void;
  onDeleteFile?: (key: string) => Promise<{ success: boolean; error?: string }>;
  onFolderClick?: (folderKey: string) => void;
}