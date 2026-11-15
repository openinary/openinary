const COLORS = ["#3b7bff", "#8db4ff", "#1c4bb0", "#22c55e", "#f5f5f5"];

interface Piece {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  spin: number;
  angle: number;
  color: string;
}

/**
 * A short confetti burst: a cannon from each bottom corner, then a smaller
 * one from the middle. Draws on its own canvas over the page and removes it
 * when the last piece has fallen. Does nothing under reduced motion.
 */
// ponytail: ~200 rectangles on one 2D canvas, no library. Reach for one only
// if this ever needs shapes, wind or anything else worth a dependency.
export function celebrate() {
  if (
    typeof window === "undefined" ||
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  )
    return;

  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const { innerWidth: width, innerHeight: height } = window;
  canvas.width = width;
  canvas.height = height;
  canvas.style.cssText =
    "position:fixed;inset:0;z-index:200;pointer-events:none";
  document.body.append(canvas);

  const pieces: Piece[] = [];
  const burst = (
    x: number,
    y: number,
    count: number,
    degrees: number,
    spread: number,
    speed: number,
  ) => {
    for (let i = 0; i < count; i++) {
      const angle =
        ((degrees + (Math.random() - 0.5) * spread) * Math.PI) / 180;
      const v = speed * (0.5 + Math.random() * 0.5);
      pieces.push({
        x,
        y,
        vx: Math.cos(angle) * v,
        vy: -Math.sin(angle) * v,
        size: 5 + Math.random() * 5,
        spin: (Math.random() - 0.5) * 0.4,
        angle: Math.random() * Math.PI,
        color: COLORS[Math.floor(Math.random() * COLORS.length)],
      });
    }
  };

  burst(0, height * 0.9, 80, 60, 70, 22);
  burst(width, height * 0.9, 80, 120, 70, 22);
  const centre = setTimeout(
    () => burst(width / 2, height * 0.6, 50, 90, 110, 14),
    280,
  );

  const started = performance.now();
  const frame = (now: number) => {
    ctx.clearRect(0, 0, width, height);
    const fade = Math.max(0, 1 - (now - started) / 3200);
    for (const p of pieces) {
      p.vy += 0.45;
      p.vx *= 0.985;
      p.x += p.vx;
      p.y += p.vy;
      p.angle += p.spin;
      ctx.save();
      ctx.globalAlpha = fade;
      ctx.translate(p.x, p.y);
      ctx.rotate(p.angle);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
      ctx.restore();
    }
    if (fade > 0 && pieces.some((p) => p.y < height + 20)) {
      requestAnimationFrame(frame);
    } else {
      clearTimeout(centre);
      canvas.remove();
    }
  };
  requestAnimationFrame(frame);
}
