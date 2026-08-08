"use client";

import { LayoutGrid, List } from "lucide-react";
import { useQueryState } from "nuqs";
import { ColumnCountSlider, DeleteFolderButton, UploadButtonWithDialog } from "@openinary/ui";
import { Button } from "./ui/button";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "./ui/breadcrumb";
import { Separator } from "./ui/separator";
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
    <header className="flex h-16 shrink-0 items-center gap-2 transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-12">
      <div className="flex items-center justify-between w-full px-4">
        <div className="flex items-center gap-2">
          <SidebarTrigger className="-ml-1" />
          <Separator
            orientation="vertical"
            className="mr-2 data-[orientation=vertical]:h-4"
          />
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbLink
                  onClick={() => setFolderPath(null)}
                  className="cursor-pointer"
                >
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
          <div className="flex items-center rounded-md border border-border p-0.5">
            <Button
              variant={view === "grid" ? "secondary" : "ghost"}
              size="icon"
              className="h-7 w-7"
              onClick={() => onViewChange?.("grid")}
              aria-label="Grid view"
            >
              <LayoutGrid className="h-4 w-4" />
            </Button>
            <Button
              variant={view === "list" ? "secondary" : "ghost"}
              size="icon"
              className="h-7 w-7"
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
