"use client";

import { Button } from "@repo/ui/components/ui/button";
import { Input } from "@repo/ui/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@repo/ui/components/ui/dropdown-menu";
import { Search, Grid3X3, List, ChevronDown } from "lucide-react";
import { Switch } from "@repo/ui/components/ui/switch";
import { atom, useAtom } from "jotai";
import { atomWithStorage } from "jotai/utils";
import { MediaGrid } from "./media-grid";
import { MediaList } from "./media-list";
import { LoadingSkeleton } from "./loading-skeleton";
import { MediaLibraryProps } from "./types";

export const viewModeAtom = atomWithStorage<"grid" | "list">(
  "media-library-view-mode",
  "grid",
);
export const searchAtom = atom<string>("");

export default function MediaLibrary({
  endpointSearch,
  mediaResult,
  isLoading = false,
  onFileDeleted,
  onDeleteFile,
  onFolderClick,
}: MediaLibraryProps) {
  const [viewMode, setViewMode] = useAtom(viewModeAtom);
  const [searchValue, setSearchValue] = useAtom(searchAtom);
  const isListView = viewMode === "list";

  const items =
    mediaResult?.success && mediaResult.data && "items" in mediaResult.data
      ? mediaResult.data.items
      : [];

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchValue(e.target.value);
  };

  const handleViewModeChange = (checked: boolean) => {
    setViewMode(checked ? "list" : "grid");
  };

  return (
    <>
      <div className="border-b px-4 sm:px-4 py-3">
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <span className="text-sm whitespace-nowrap">Sort by:</span>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button className="h-8" variant="outline" size="sm">
                  Relevance
                  <ChevronDown className="w-4 h-4 ml-2" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuItem>Relevance</DropdownMenuItem>
                <DropdownMenuItem>Date uploaded</DropdownMenuItem>
                <DropdownMenuItem>File size</DropdownMenuItem>
                <DropdownMenuItem>File name</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          <div className="flex items-center gap-2 w-full sm:flex-1">
            <div className="flex-1 max-w-md relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 transform -translate-y-1/2" />
              <Input
                placeholder="Search Media Library"
                className="pl-10 h-8"
                value={searchValue}
                onChange={handleSearchChange}
              />
            </div>

            <div>
              <div className="relative inline-grid h-9 grid-cols-[1fr_1fr] items-center text-sm font-medium">
                <Switch
                  checked={isListView}
                  onCheckedChange={handleViewModeChange}
                  className="peer data-[state=checked]:bg-input/50 data-[state=unchecked]:bg-input/50 absolute inset-0 h-[inherit] w-auto [&_span]:h-full [&_span]:w-1/2 [&_span]:transition-transform [&_span]:duration-300 [&_span]:ease-[cubic-bezier(0.16,1,0.3,1)] [&_span]:data-[state=checked]:translate-x-full [&_span]:data-[state=checked]:rtl:-translate-x-full [&>span]:!bg-primary"
                />
                <span className="pointer-events-none relative ms-0.5 flex min-w-8 items-center justify-center text-center text-background peer-data-[state=checked]:text-primary">
                  <Grid3X3 size={16} />
                </span>
                <span className="pointer-events-none relative me-0.5 flex min-w-8 items-center justify-center text-center text-background peer-data-[state=unchecked]:text-primary">
                  <List size={16} />
                </span>
              </div>
              <span className="sr-only">Toggle between grid and list view</span>
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1 flex">
        <div className="flex-1 p-4 sm:p-6">
          <div className="mb-4">
            <span className="text-sm">Showing {items.length} items</span>
          </div>

          {isLoading ? (
            <LoadingSkeleton viewMode={viewMode} />
          ) : viewMode === "grid" ? (
            <MediaGrid
              items={items}
              onFileDeleted={onFileDeleted}
              onDeleteFile={onDeleteFile}
              onFolderClick={onFolderClick}
            />
          ) : (
            <MediaList
              items={items}
              onFileDeleted={onFileDeleted}
              onDeleteFile={onDeleteFile}
              onFolderClick={onFolderClick}
            />
          )}
        </div>
      </div>
    </>
  );
}
