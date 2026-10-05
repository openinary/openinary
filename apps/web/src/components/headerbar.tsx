"use client";

import { LayoutGrid, List } from "lucide-react";
import { useQueryState } from "nuqs";
import { ColumnCountSlider, DeleteFolderButton, UploadButtonWithDialog } from "@openinary/ui";
import { HistoryNav } from "./history-nav";
import { Button } from "./ui/button";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "./ui/breadcrumb";
import { SidebarTrigger } from "./ui/sidebar";

export default function HeaderBar({
  columns,
  onColumnsChange,
  view = "grid",
  onViewChange,
}: {
  columns: number;
  onColumnsChange: (columns: number) => void;
  view?: "grid" | "list";
  onViewChange?: (view: "grid" | "list") => void;
}) {
  const [folderPath, setFolderPath] = useQueryState("folder");

  return (
    <header className="flex h-12 shrink-0 items-center gap-2 border-b">
      <div className="flex items-center justify-between w-full px-1.5">
        <div className="flex items-center gap-2">
          <SidebarTrigger className="md:hidden" />
          <HistoryNav />
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbLink
                  onClick={() => setFolderPath(null)}
                  className="flex cursor-pointer items-center gap-1.5"
                >
                  <LayoutGrid className="size-3.5" />
                  Assets
                </BreadcrumbLink>
              </BreadcrumbItem>
              {folderPath &&
                folderPath
                  .split("/")
                  .filter(Boolean)
                  .map((segment, index, segments) => {
                    const pathToSegment = segments
                      .slice(0, index + 1)
                      .join("/");
                    const isLast = index === segments.length - 1;
                    return (
                      <div
                        key={pathToSegment}
                        className="flex items-center gap-1.5"
                      >
                        <BreadcrumbSeparator />
                        <BreadcrumbItem>
                          {isLast ? (
                            <BreadcrumbPage>{segment}</BreadcrumbPage>
                          ) : (
                            <BreadcrumbLink
                              onClick={() => setFolderPath(pathToSegment)}
                              className="cursor-pointer"
                            >
                              {segment}
                            </BreadcrumbLink>
                          )}
                        </BreadcrumbItem>
                      </div>
                    );
                  })}
            </BreadcrumbList>
          </Breadcrumb>
        </div>
        <div className="flex items-center gap-2">
          {folderPath && (
            <DeleteFolderButton
              folderPath={folderPath}
              onSuccessfulDelete={(v) =>
                setFolderPath(v.includes("/") ? v.replace(/\/\w+$/i, "") : "")
              }
            />
          )}
          {view === "grid" && (
            <ColumnCountSlider value={columns} onChange={onColumnsChange} />
          )}
          <div className="flex items-center rounded-[11px] border border-border p-px shadow-xs">
            <Button
              variant={view === "grid" ? "secondary" : "ghost"}
              size="icon"
              className="size-8"
              onClick={() => onViewChange?.("grid")}
              aria-label="Grid view"
            >
              <LayoutGrid className="h-4 w-4" />
            </Button>
            <Button
              variant={view === "list" ? "secondary" : "ghost"}
              size="icon"
              className="size-8"
              onClick={() => onViewChange?.("list")}
              aria-label="List view"
            >
              <List className="h-4 w-4" />
            </Button>
          </div>
          <UploadButtonWithDialog uploadToFolder={folderPath || undefined} />
        </div>
      </div>
    </header>
  );
}
