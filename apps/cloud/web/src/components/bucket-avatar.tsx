"use client";

import { renderGradient } from "@outpacelabs/avatars";
import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

/**
 * <GradientAvatar> always paints its 256px internal canvas, so at our 20-32px
 * display sizes the dither cells get averaged into a smear. Painting at the
 * device resolution instead keeps every cell a crisp square (drawDither sizes
 * cells off the canvas dimension, so this also gives us more of them).
 */
export function BucketAvatar({
  name,
  size = 32,
  className,
}: {
  name: string;
  size?: number;
  className?: string;
}) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    // drawDither derives its cell from the canvas dimension (~size/72, floored
    // at 2px), so oversampling past the device resolution is what shrinks the
    // cells: 2x here halves them on screen.
    canvas.width = canvas.height = Math.round(size * dpr * 2);
    renderGradient(canvas, name, { pattern: "dither" });
  }, [name, size]);

  return (
    <canvas
      ref={ref}
      aria-hidden
      className={cn(
        // The dither pattern frays the edges, so light gradients bleed into the
        // sidebar - an inset ring keeps the square readable at every size.
        "inset-ring-1 inset-ring-black/15 shrink-0 rounded-md dark:inset-ring-white/15",
        className,
      )}
      style={{ width: size, height: size, imageRendering: "pixelated" }}
    />
  );
}
