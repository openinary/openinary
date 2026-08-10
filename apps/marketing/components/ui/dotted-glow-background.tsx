"use client";

import React, { useEffect, useRef, useState, useId } from "react";

type DottedGlowBackgroundProps = {
  className?: string;
  gap?: number;
  radius?: number;
  color?: string;
  darkColor?: string;
  glowColor?: string;
  darkGlowColor?: string;
  colorLightVar?: string;
  colorDarkVar?: string;
  glowColorLightVar?: string;
  glowColorDarkVar?: string;
  opacity?: number;
  backgroundOpacity?: number;
  speedMin?: number;
  speedMax?: number;
  speedScale?: number;
};

// Simple hash for deterministic per-dot alpha
function hash(i: number, j: number) {
  let h = (i * 374761393 + j * 668265263) ^ 0x5bd1e995;
  h = Math.imul(h ^ (h >>> 15), 0x27d4eb2d);
  return ((h ^ (h >>> 13)) >>> 0) / 4294967296;
}

/**
 * Static dotted background with CSS-animated glow shimmer.
 * - Dots are drawn ONCE on canvas (no requestAnimationFrame loop).
 * - Shimmer is handled by CSS-animated radial gradient blobs on the compositor thread.
 * - Zero main-thread cost during animation.
 */
export const DottedGlowBackground = ({
  className,
  gap = 12,
  radius = 2,
  color = "rgba(0,0,0,0.7)",
  darkColor,
  glowColor = "rgba(0, 170, 255, 0.85)",
  darkGlowColor,
  colorLightVar,
  colorDarkVar,
  glowColorLightVar,
  glowColorDarkVar,
  opacity = 0.6,
  backgroundOpacity = 0,
  speedMin: _speedMin,
  speedMax: _speedMax,
  speedScale = 1,
}: DottedGlowBackgroundProps) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [resolvedColor, setResolvedColor] = useState<string>(color);
  const [resolvedGlowColor, setResolvedGlowColor] = useState<string>(glowColor);
  const uid = useId().replace(/:/g, "");

  const resolveCssVariable = (
    el: Element,
    variableName?: string,
  ): string | null => {
    if (!variableName) return null;
    const normalized = variableName.startsWith("--")
      ? variableName
      : `--${variableName}`;
    const fromEl = getComputedStyle(el as Element)
      .getPropertyValue(normalized)
      .trim();
    if (fromEl) return fromEl;
    const root = document.documentElement;
    const fromRoot = getComputedStyle(root).getPropertyValue(normalized).trim();
    return fromRoot || null;
  };

  const detectDarkMode = (): boolean => {
    const root = document.documentElement;
    if (root.classList.contains("dark")) return true;
    if (root.classList.contains("light")) return false;
    return (
      window.matchMedia &&
      window.matchMedia("(prefers-color-scheme: dark)").matches
    );
  };

  useEffect(() => {
    const container = containerRef.current ?? document.documentElement;

    const compute = () => {
      const isDark = detectDarkMode();
      let nextColor: string = color;
      let nextGlow: string = glowColor;

      if (isDark) {
        const varDot = resolveCssVariable(container, colorDarkVar);
        const varGlow = resolveCssVariable(container, glowColorDarkVar);
        nextColor = varDot || darkColor || nextColor;
        nextGlow = varGlow || darkGlowColor || nextGlow;
      } else {
        const varDot = resolveCssVariable(container, colorLightVar);
        const varGlow = resolveCssVariable(container, glowColorLightVar);
        nextColor = varDot || nextColor;
        nextGlow = varGlow || nextGlow;
      }

      setResolvedColor(nextColor);
      setResolvedGlowColor(nextGlow);
    };

    compute();

    const mql = window.matchMedia
      ? window.matchMedia("(prefers-color-scheme: dark)")
      : null;
    const handleMql = () => compute();
    mql?.addEventListener?.("change", handleMql);

    const mo = new MutationObserver(() => compute());
    mo.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class", "style"],
    });

    return () => {
      mql?.removeEventListener?.("change", handleMql);
      mo.disconnect();
    };
  }, [
    color,
    darkColor,
    glowColor,
    darkGlowColor,
    colorLightVar,
    colorDarkVar,
    glowColorLightVar,
    glowColorDarkVar,
  ]);

  // Draw dots ONCE (static). Re-draw only on resize or color change.
  useEffect(() => {
    const el = canvasRef.current;
    const container = containerRef.current;
    if (!el || !container) return;

    const ctx = el.getContext("2d", { alpha: true });
    if (!ctx) return;

    const dpr = Math.min(Math.max(1, window.devicePixelRatio || 1), 2);

    const drawStatic = () => {
      const { width, height } = container.getBoundingClientRect();
      el.width = Math.max(1, Math.floor(width * dpr));
      el.height = Math.max(1, Math.floor(height * dpr));
      el.style.width = `${Math.floor(width)}px`;
      el.style.height = `${Math.floor(height)}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, el.width, el.height);

      // Optional background fade
      if (backgroundOpacity > 0) {
        const grad = ctx.createRadialGradient(
          width * 0.5,
          height * 0.4,
          Math.min(width, height) * 0.1,
          width * 0.5,
          height * 0.5,
          Math.max(width, height) * 0.7,
        );
        grad.addColorStop(0, "rgba(0,0,0,0)");
        grad.addColorStop(
          1,
          `rgba(0,0,0,${Math.min(Math.max(backgroundOpacity, 0), 1)})`,
        );
        ctx.globalAlpha = opacity;
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, width, height);
      }

      // Draw dots with deterministic per-dot alpha variation
      ctx.fillStyle = resolvedColor;
      const cols = Math.ceil(width / gap) + 2;
      const rows = Math.ceil(height / gap) + 2;

      for (let i = -1; i < cols; i++) {
        for (let j = -1; j < rows; j++) {
          const x = i * gap + (j % 2 === 0 ? 0 : gap * 0.5);
          const y = j * gap;
          // Deterministic alpha: 0.25–0.8 range based on grid position
          const a = 0.25 + 0.55 * hash(i, j);
          ctx.globalAlpha = a * opacity;
          ctx.beginPath();
          ctx.arc(x, y, radius, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    };

    drawStatic();

    const ro = new ResizeObserver(drawStatic);
    ro.observe(container);

    return () => ro.disconnect();
  }, [gap, radius, resolvedColor, opacity, backgroundOpacity]);

  // Animation speed: higher speedScale = faster blob movement
  const baseDuration = 20 / Math.max(speedScale, 0.1);

  return (
    <div
      ref={containerRef}
      className={className}
      style={{ position: "absolute", inset: 0, overflow: "hidden" }}
    >
      <canvas
        ref={canvasRef}
        style={{ display: "block", width: "100%", height: "100%" }}
      />
      {/* CSS-animated glow blobs — runs entirely on GPU compositor, zero JS cost */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          pointerEvents: "none",
          mixBlendMode: "soft-light",
        }}
      >
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            style={{
              position: "absolute",
              width: "50%",
              height: "50%",
              borderRadius: "50%",
              background: `radial-gradient(circle, ${resolvedGlowColor}, transparent 70%)`,
              opacity: 0.4,
              animation: `dgb-float-${uid}-${i} ${baseDuration + i * 6}s ease-in-out infinite`,
              willChange: "transform",
            }}
          />
        ))}
      </div>
      <style>{`
        @keyframes dgb-float-${uid}-0 {
          0%, 100% { transform: translate3d(5%, 10%, 0); }
          33% { transform: translate3d(55%, 45%, 0); }
          66% { transform: translate3d(25%, 65%, 0); }
        }
        @keyframes dgb-float-${uid}-1 {
          0%, 100% { transform: translate3d(65%, 5%, 0); }
          33% { transform: translate3d(15%, 55%, 0); }
          66% { transform: translate3d(75%, 35%, 0); }
        }
        @keyframes dgb-float-${uid}-2 {
          0%, 100% { transform: translate3d(35%, 65%, 0); }
          33% { transform: translate3d(75%, 15%, 0); }
          66% { transform: translate3d(5%, 35%, 0); }
        }
      `}</style>
    </div>
  );
};
