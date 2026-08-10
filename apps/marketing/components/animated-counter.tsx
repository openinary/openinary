"use client";

import { useEffect, useRef, useState } from "react";

let hasAnimated = false;

interface AnimatedCounterProps {
  value: number;
  duration?: number;
  onComplete?: () => void;
}

export function AnimatedCounter({
  value,
  duration = 1500,
  onComplete,
}: AnimatedCounterProps) {
  const [display, setDisplay] = useState(hasAnimated ? value : 0);
  const rafRef = useRef<number | null>(null);
  const startTimeRef = useRef<number | null>(null);

  useEffect(() => {
    if (value <= 0) return;

    if (hasAnimated) {
      setDisplay(value);
      onComplete?.();
      return;
    }

    startTimeRef.current = null;

    const animate = (timestamp: number) => {
      if (!startTimeRef.current) startTimeRef.current = timestamp;
      const elapsed = timestamp - startTimeRef.current;
      const progress = Math.min(elapsed / duration, 1);

      // ease-out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = Math.round(eased * value);

      setDisplay(current);

      if (progress < 1) {
        rafRef.current = requestAnimationFrame(animate);
      } else {
        hasAnimated = true;
        onComplete?.();
      }
    };

    rafRef.current = requestAnimationFrame(animate);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [value, duration]);

  const digits = Math.max(value > 0 ? String(value).length : 1, 3);

  return (
    <span style={{ fontVariantNumeric: "tabular-nums" }}>
      {String(display).padStart(digits, "0")}
    </span>
  );
}
