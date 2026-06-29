"use client";

import { ColumnDef } from "@tanstack/react-table";
import { ArrowUpDown, Folder, FileImage, FileVideo } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TRANSFORM_BASE_URL } from "./constants";
import type { MediaRow } from "./types";

const ROW_TYPE_LABELS: Record<MediaRow["rowType"], string> = {
  folder: "Folder",
  image: "Image",
  video: "Video",
};

function RowPreview({ row }: { row: MediaRow }) {
  if (row.rowType === "folder") {
    return (
      <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded bg-muted">
        <Folder className="h-5 w-5 text-muted-foreground" />
      </div>
    );
  }

  if (row.rowType === "video") {
    const src = `${TRANSFORM_BASE_URL}/t/t_true,tt_5,f_webp,w_80,h_80,c_fill,q_70/${row.path}`;
    return (
      <div className="relative flex h-10 w-10 flex-shrink-0 items-center justify-center overflow-hidden rounded">
        <img src={src} alt={row.name} className="h-full w-full object-cover" loading="lazy" />
        <FileVideo className="absolute h-4 w-4 text-white drop-shadow" />
      </div>
    );
  }

  return (
    <img
      src={`${TRANSFORM_BASE_URL}/t/w_80,h_80,q_70/${row.path}`}
      alt={row.name}
      className="h-10 w-10 flex-shrink-0 rounded object-cover"
      loading="lazy"
    />
  );
}

export const columns: ColumnDef<MediaRow>[] = [
  {
    id: "preview",
    header: "",
    cell: ({ row }) => <RowPreview row={row.original} />,
    enableSorting: false,
  },
  {
    accessorKey: "name",
    header: ({ column }) => (
      <Button
        variant="ghost"
        size="sm"
        className="-ml-3 h-8"
        onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
      >
        Name
        <ArrowUpDown className="ml-2 h-3.5 w-3.5" />
      </Button>
    ),
    cell: ({ row }) => (
      <span className="block max-w-[300px] truncate font-medium">
        {row.original.name}
      </span>
    ),
  },
  {
    accessorKey: "rowType",
    header: ({ column }) => (
      <Button
        variant="ghost"
        size="sm"
        className="-ml-3 h-8"
        onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
      >
        Type
        <ArrowUpDown className="ml-2 h-3.5 w-3.5" />
      </Button>
    ),
    cell: ({ row }) => (
      <Badge variant="secondary">{ROW_TYPE_LABELS[row.original.rowType]}</Badge>
    ),
  },
  {
    accessorKey: "path",
    header: "Path",
    cell: ({ row }) => (
      <span className="block max-w-[400px] truncate text-sm text-muted-foreground">
        {row.original.path}
      </span>
    ),
    enableSorting: false,
  },
];
