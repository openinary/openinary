"use client";

import { LayoutGrid, Square } from "lucide-react";
import { Slider as SliderPrimitive } from "radix-ui";
import { useState } from "react";

const MIN_COLUMNS = 4;
const MAX_COLUMNS = 10;
const THUMB_WIDTH = 24;

export function ColumnCountSlider({
  value,
  onChange,
}: {
  value: number;
  onChange: (value: number) => void;
}) {
  const [dragging, setDragging] = useState(false);
  const percent = ((value - MIN_COLUMNS) / (MAX_COLUMNS - MIN_COLUMNS)) * 100;

  return (
    <div className="flex w-36 items-center gap-2">
      <Square className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      <div className="relative flex-1">
        <SliderPrimitive.Root
          className="relative flex w-full touch-none select-none items-center"
          value={[value]}
          min={MIN_COLUMNS}
          max={MAX_COLUMNS}
          step={1}
          onValueChange={([v]) => onChange(v)}
          onPointerDown={() => setDragging(true)}
          onPointerUp={() => setDragging(false)}
        >
          <SliderPrimitive.Track className="relative h-1.5 w-full grow overflow-hidden rounded-full bg-muted">
            <SliderPrimitive.Range className="absolute h-full bg-primary" />
          </SliderPrimitive.Track>
          <SliderPrimitive.Thumb className="block h-3.5 w-6 shrink-0 rounded-full border border-black/10 bg-white shadow-md ring-ring/50 transition-[box-shadow] hover:ring-4 focus-visible:outline-hidden focus-visible:ring-4" />
        </SliderPrimitive.Root>
        {dragging && (
          // Thumb centre travels between half a thumb from each end, so the
          // label tracks the percentage minus that inset.
          <div
            className="-translate-x-1/2 pointer-events-none absolute top-full mt-2.5 w-fit whitespace-nowrap rounded-md bg-primary px-3 py-1.5 text-primary-foreground text-xs"
            style={{
              left: `calc(${percent}% + ${(THUMB_WIDTH / 2) * (1 - percent / 50)}px)`,
            }}
          >
            {value} columns
          </div>
        )}
      </div>
      <LayoutGrid className="h-4 w-4 shrink-0 text-muted-foreground" />
    </div>
  );
}
