"use client";

import { LayoutGrid, Square } from "lucide-react";
import { useState } from "react";
import { Slider } from "../ui/slider";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "../ui/tooltip";

export const MIN_COLUMNS = 4;
export const MAX_COLUMNS = 10;

export function ColumnCountSlider({
  value,
  onChange,
}: {
  value: number;
  onChange: (value: number) => void;
}) {
  const [dragging, setDragging] = useState(false);

  return (
    <TooltipProvider>
      <div className="flex items-center gap-2 w-36">
        <Square className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        <Tooltip open={dragging}>
          <TooltipTrigger asChild>
            <Slider
              value={[value]}
              min={MIN_COLUMNS}
              max={MAX_COLUMNS}
              step={1}
              onValueChange={([v]) => onChange(v)}
              onPointerDown={() => setDragging(true)}
              onPointerUp={() => setDragging(false)}
              thumbClassName="h-3.5 w-6 rounded-full"
            />
          </TooltipTrigger>
          <TooltipContent sideOffset={14}>{value} columns</TooltipContent>
        </Tooltip>
        <LayoutGrid className="h-4 w-4 text-muted-foreground shrink-0" />
      </div>
    </TooltipProvider>
  );
}
