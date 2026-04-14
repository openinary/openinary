import { LayoutGrid, List } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ViewMode } from "./types";

interface ViewToggleProps {
  view: ViewMode;
  onViewChange: (view: ViewMode) => void;
}

export function ViewToggle({ view, onViewChange }: ViewToggleProps) {
  return (
    <div className="flex items-center gap-0.5 rounded-md border p-0.5">
      <Button
        variant={view === "grid" ? "secondary" : "ghost"}
        size="icon"
        className="h-7 w-7"
        onClick={() => onViewChange("grid")}
        aria-label="Grid view"
      >
        <LayoutGrid className="h-4 w-4" />
      </Button>
      <Button
        variant={view === "list" ? "secondary" : "ghost"}
        size="icon"
        className="h-7 w-7"
        onClick={() => onViewChange("list")}
        aria-label="List view"
      >
        <List className="h-4 w-4" />
      </Button>
    </div>
  );
}
