"use client";

import { DeleteFolderButton, UploadButtonWithDialog } from "@openinary/ui";
import { LayoutGrid, List } from "lucide-react";
import { useQueryState } from "nuqs";

import { ColumnCountSlider } from "@/components/column-count-slider";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";

export default function HeaderBar({
  columns,
  onColumnsChange,
  view = "grid",
  onViewChange,
  showControls = true,
}: {
  columns: number;
  onColumnsChange: (columns: number) => void;
  view?: "grid" | "list";
  onViewChange?: (view: "grid" | "list") => void;
  /**
   * False while MediaGrid is showing its empty state, which carries its own
   * Upload button. Sorting controls for nothing, next to a second Upload, is
   * noise on the one screen that should be pointing at a single action.
   */
  showControls?: boolean;
}) {
  const [folderPath, setFolderPath] = useQueryState("folder");

  return (
    <header className="flex h-16 shrink-0 items-center gap-2 shadow-[0_1px_0_0_oklch(0_0_0/0.06),0_2px_4px_-2px_oklch(0_0_0/0.04)] transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-12 dark:shadow-[0_1px_0_0_oklch(1_0_0/0.08),0_2px_4px_-2px_oklch(0_0_0/0.4)]">
      {/* Padding tracks the grid's own @2xl/main step below, so the breadcrumb
          stays aligned with the first column at every panel width. */}
      <div className="flex w-full items-center justify-between gap-2 @2xl/main:px-6 px-4">
        <div className="flex min-w-0 items-center gap-2">
          <SidebarTrigger className="-ml-1" />
          <Separator
            orientation="vertical"
            className="mr-2 data-[orientation=vertical]:h-4"
          />
          <Breadcrumb className="min-w-0">
            {/* Nowrap: wrapping would break the fixed h-16 header, so deep
                folder paths scroll horizontally instead. */}
            <BreadcrumbList className="flex-nowrap overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              <BreadcrumbItem className="shrink-0">
                <BreadcrumbLink asChild>
                  <button
                    type="button"
                    onClick={() => setFolderPath(null)}
                    className="before:-inset-y-2.5 relative cursor-pointer rounded-sm outline-none before:absolute before:inset-x-0 before:content-[''] focus-visible:ring-[3px] focus-visible:ring-ring/50"
                  >
                    Assets
                  </button>
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
                        className="flex shrink-0 items-center gap-1.5"
                      >
                        <BreadcrumbSeparator />
                        <BreadcrumbItem>
                          {isLast ? (
                            <BreadcrumbPage>{segment}</BreadcrumbPage>
                          ) : (
                            <BreadcrumbLink asChild>
                              <button
                                type="button"
                                onClick={() => setFolderPath(pathToSegment)}
                                className="before:-inset-y-2.5 relative cursor-pointer rounded-sm outline-none before:absolute before:inset-x-0 before:content-[''] focus-visible:ring-[3px] focus-visible:ring-ring/50"
                              >
                                {segment}
                              </button>
                            </BreadcrumbLink>
                          )}
                        </BreadcrumbItem>
                      </div>
                    );
                  })}
            </BreadcrumbList>
          </Breadcrumb>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {folderPath && (
            <DeleteFolderButton
              folderPath={folderPath}
              onSuccessfulDelete={(v) =>
                setFolderPath(v.includes("/") ? v.replace(/\/\w+$/i, "") : "")
              }
            />
          )}
          {showControls && (
            <>
              {/* The slider is the first thing to go when the Asset Details
                  sidebar squeezes this panel - the view toggle and Upload are
                  not droppable, the column count is. */}
              {view === "grid" && (
                <div className="@xl/main:block hidden">
                  <ColumnCountSlider
                    value={columns}
                    onChange={onColumnsChange}
                  />
                </div>
              )}
              {/* 32px total to match Upload: 28px buttons + 1px padding + 1px
                  border. Outer radius = inner radius + padding: 8 + 1 = 9px. */}
              <div className="flex items-center rounded-[9px] border border-border p-px">
                <Button
                  variant={view === "grid" ? "secondary" : "ghost"}
                  size="icon"
                  className="before:-inset-y-1 relative size-7 before:absolute before:inset-x-0 before:content-['']"
                  onClick={() => onViewChange?.("grid")}
                  aria-label="Grid view"
                  aria-pressed={view === "grid"}
                >
                  <LayoutGrid className="h-4 w-4" />
                </Button>
                <Button
                  variant={view === "list" ? "secondary" : "ghost"}
                  size="icon"
                  className="before:-inset-y-1 relative size-7 before:absolute before:inset-x-0 before:content-['']"
                  onClick={() => onViewChange?.("list")}
                  aria-label="List view"
                  aria-pressed={view === "list"}
                >
                  <List className="h-4 w-4" />
                </Button>
              </div>
              <UploadButtonWithDialog
                uploadToFolder={folderPath || undefined}
              />
            </>
          )}
        </div>
      </div>
    </header>
  );
}
