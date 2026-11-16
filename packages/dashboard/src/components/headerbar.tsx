"use client";

import {
  ColumnCountSlider,
  DeleteFolderButton,
  UploadButtonWithDialog,
} from "@openinary/ui";
import { LayoutGrid, List } from "lucide-react";

import { PageHeader } from "./page";

/**
 * The file explorer's one bar: Assets and a crumb per folder on the left, the
 * controls on the right. The grid sits right under it, with no page head:
 * the bar already says where you are. While files are selected their actions
 * replace the controls, through the slot MediaGrid portals into.
 */
export function HeaderBar({
  folderPath,
  onFolderPathChange,
  columns,
  onColumnsChange,
  view = "grid",
  onViewChange,
  showControls = true,
  selectionSlotRef,
}: {
  folderPath: string | null;
  onFolderPathChange: (folderPath: string | null) => void;
  columns: number;
  onColumnsChange: (columns: number) => void;
  view?: "grid" | "list";
  onViewChange?: (view: "grid" | "list") => void;
  /** False while MediaGrid shows its empty state, which has its own Upload. */
  showControls?: boolean;
  /** Receives the node MediaGrid portals the selection's actions into. */
  selectionSlotRef?: (node: HTMLDivElement | null) => void;
}) {
  const parts = (folderPath ?? "").split("/").filter(Boolean);

  return (
    <PageHeader
      breadcrumb={[
        {
          label: "Assets",
          onClick: parts.length ? () => onFolderPathChange(null) : undefined,
        },
        ...parts.map((part, index) => ({
          label: part,
          onClick:
            index < parts.length - 1
              ? () => onFolderPathChange(parts.slice(0, index + 1).join("/"))
              : undefined,
        })),
      ]}
      actions={
        <>
          {/* Empty unless something is selected; when filled it hides the
              controls next to it. */}
          <div
            ref={selectionSlotRef}
            className="peer flex shrink-0 items-center empty:hidden"
          />
          <div className="flex shrink-0 items-center gap-2 peer-[:not(:empty)]:hidden">
            {folderPath && (
              <DeleteFolderButton
                folderPath={folderPath}
                onSuccessfulDelete={(v) =>
                  onFolderPathChange(
                    v.includes("/") ? v.replace(/\/\w+$/i, "") : "",
                  )
                }
              />
            )}
            {showControls && (
              <>
                {view === "grid" && (
                  <div className="@3xl/main:block hidden">
                    <ColumnCountSlider
                      value={columns}
                      onChange={onColumnsChange}
                    />
                  </div>
                )}
                {/* biome-ignore lint/a11y/useSemanticElements: a pair of toggles */}
                <div
                  role="group"
                  aria-label="View"
                  className="ds-segments ds-segments--sm"
                >
                  <button
                    type="button"
                    className="px-2!"
                    onClick={() => onViewChange?.("grid")}
                    aria-label="Grid view"
                    aria-pressed={view === "grid"}
                  >
                    <LayoutGrid className="size-3.5" />
                  </button>
                  <button
                    type="button"
                    className="px-2!"
                    onClick={() => onViewChange?.("list")}
                    aria-label="List view"
                    aria-pressed={view === "list"}
                  >
                    <List className="size-3.5" />
                  </button>
                </div>
                <UploadButtonWithDialog
                  uploadToFolder={folderPath || undefined}
                />
              </>
            )}
          </div>
        </>
      }
    />
  );
}
