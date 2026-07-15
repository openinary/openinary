"use client";

import { useState } from "react";
import {
  ChevronRight,
  FileImage,
  FileVideo,
  FolderIcon,
  FolderOpenIcon,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import {
  useStorageLevel,
  type StorageFile,
  type StorageFolder,
  type MediaFile,
} from "@openinary/ui";

interface LazyStorageTreeProps {
  onMediaSelect?: (media: MediaFile) => void;
}

const rowClass =
  "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm cursor-pointer transition-colors hover:bg-accent/60 text-left";

function indentStyle(depth: number) {
  return { paddingLeft: `${depth * 12 + 8}px` };
}

function LevelSkeleton({ depth }: { depth: number }) {
  return (
    <div className="space-y-1 py-1" style={indentStyle(depth)}>
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="flex items-center gap-2 px-2">
          <Skeleton className="h-4 w-4 rounded" />
          <Skeleton className={cn("h-4", i === 1 ? "w-32" : "w-24")} />
        </div>
      ))}
    </div>
  );
}

function FileRow({
  file,
  depth,
  onMediaSelect,
}: {
  file: StorageFile;
  depth: number;
  onMediaSelect?: (media: MediaFile) => void;
}) {
  const Icon = file.type === "video" ? FileVideo : FileImage;
  return (
    <li>
      <button
        type="button"
        className={rowClass}
        style={indentStyle(depth)}
        onClick={() => onMediaSelect?.(file)}
      >
        {/* Spacer aligning files with folder chevrons */}
        <span className="size-3.5 shrink-0" />
        <Icon className="size-4 shrink-0 text-muted-foreground" />
        <span className="min-w-0 flex-1 truncate">{file.name}</span>
      </button>
    </li>
  );
}

function LazyFolderNode({
  folder,
  depth,
  onMediaSelect,
}: {
  folder: StorageFolder;
  depth: number;
  onMediaSelect?: (media: MediaFile) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <li>
      <button
        type="button"
        className={rowClass}
        style={indentStyle(depth)}
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
      >
        <ChevronRight
          className={cn(
            "size-3.5 shrink-0 text-muted-foreground transition-transform",
            open && "rotate-90",
          )}
        />
        {open ? (
          <FolderOpenIcon className="size-4 shrink-0 text-muted-foreground" />
        ) : (
          <FolderIcon className="size-4 shrink-0 text-muted-foreground" />
        )}
        <span className="min-w-0 flex-1 truncate">{folder.name}</span>
      </button>
      {/* The child level mounts (and fetches) only on first expand */}
      {open && (
        <LazyTreeLevel
          path={folder.path}
          depth={depth + 1}
          onMediaSelect={onMediaSelect}
        />
      )}
    </li>
  );
}

function LazyTreeLevel({
  path,
  depth,
  onMediaSelect,
}: {
  path: string;
  depth: number;
  onMediaSelect?: (media: MediaFile) => void;
}) {
  // Shares the ["storage-tree", path] cache with the media grid
  const { data, isLoading, error } = useStorageLevel(path);

  if (isLoading) {
    return <LevelSkeleton depth={depth} />;
  }

  if (error) {
    return (
      <p className="px-2 py-1 text-xs text-red-600" style={indentStyle(depth)}>
        Failed to load folder
      </p>
    );
  }

  if (!data) return null;

  if (data.folders.length === 0 && data.files.length === 0) {
    return (
      <p
        className="px-2 py-1 text-xs text-muted-foreground"
        style={indentStyle(depth + 1)}
      >
        Empty
      </p>
    );
  }

  return (
    <ul>
      {data.folders.map((folder) => (
        <LazyFolderNode
          key={folder.path}
          folder={folder}
          depth={depth}
          onMediaSelect={onMediaSelect}
        />
      ))}
      {data.files.map((file) => (
        <FileRow
          key={file.path}
          file={file}
          depth={depth}
          onMediaSelect={onMediaSelect}
        />
      ))}
    </ul>
  );
}

export function LazyStorageTree({ onMediaSelect }: LazyStorageTreeProps) {
  return <LazyTreeLevel path="" depth={0} onMediaSelect={onMediaSelect} />;
}
