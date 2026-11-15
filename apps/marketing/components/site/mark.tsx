import { useId } from "react";

import { cn } from "@/lib/utils";

const BODY =
  "M63.4224 0C74.1457 0 79.5076 0.00142637 83.8372 1.44547C92.2236 4.24338 98.8059 10.8255 101.604 19.2119C103.048 23.5415 103.049 28.9035 103.049 39.6268V51.5658H70.8692L94.079 41.6991L87.1948 37.1294L64.6757 45.8249L75.2468 31.837L67.6443 29.7557L55.9709 42.8381L55.1017 28.1043H47.3575L46.4747 42.8381L34.8103 29.7557L27.2125 31.837L37.7698 45.8206L15.2643 37.1294L8.38006 41.6991L31.5853 51.5658H0L0 39.6268C0 28.9035 0.00142637 23.5415 1.44547 19.2119C4.24338 10.8255 10.8255 4.24338 19.2119 1.44547C23.5415 0.00142637 28.9035 0 39.6268 0L63.4224 0Z";

/** The six rays under the burst, from left to right. */
const RAYS = [
  "M29.8745 59.2686L0.0274456 70.7959C0.00181909 68.6514 0 66.2192 0 63.4222L0 59.2686H29.8745Z",
  "M8.97896 95.5252C5.57455 92.3613 2.95561 88.3653 1.44514 83.8378C1.18358 83.0536 0.966405 82.2365 0.791016 81.3587L34.3251 67.1006L8.97896 95.5252Z",
  "M42.9136 103.049H39.6245C31.0807 103.049 25.9403 103.047 22.0137 102.317L44.7386 72.2227L42.9136 103.049Z",
  "M80.5019 102.409C76.6427 103.046 71.5864 103.049 63.4218 103.049H59.5335L57.6992 72.2139L80.5019 102.409Z",
  "M102.201 81.5916C102.035 82.3812 101.839 83.1237 101.601 83.8376C100.042 88.5111 97.3051 92.6215 93.7383 95.8315L68.1133 67.0957L102.201 81.5916Z",
  "M103.051 63.4222C103.051 66.3192 103.043 68.8248 103.015 71.0244L72.582 59.2686H103.051V63.4222Z",
];

/**
 * The top cut into six wedges between its white rays, right to left, so the
 * wave can run on round the top. Each wedge is fanned from the burst's centre
 * and overlaps its neighbours by a degree, so no seam shows at rest.
 */
const WEDGES = [
  "51.2,55.5 211.2,58.3 208.2,24.7 198.3,-7.5",
  "51.2,55.5 200.4,-2.4 180,-39.4 150.6,-69.9",
  "51.2,55.5 154.9,-66.3 105.1,-95.1 48.4,-104.5",
  "51.2,55.5 54,-104.5 -2.7,-95.1 -52.5,-66.3",
  "51.2,55.5 -48.2,-69.9 -77.6,-39.4 -98,-2.4",
  "51.2,55.5 -95.9,-7.5 -105.8,24.7 -108.8,58.3",
];

const step = (o: number) => ({ "--o": o }) as React.CSSProperties;

/**
 * The Openinary mark alone, in currentColor. Inside a hovered link a wave
 * dims each piece in turn: the rays under the burst left to right, then the
 * top back over from right to left (`.mark-piece` in styles/index.css).
 */
export function Mark({ className }: { className?: string }) {
  const id = useId().replace(/[^\w-]/g, ""); // safe inside url(#...)
  return (
    <svg viewBox="0 0 104 104" fill="currentColor" aria-hidden className={cn("mark", className)}>
      <defs>
        {WEDGES.map((points, i) => (
          <clipPath key={points} id={`${id}w${i}`}>
            <polygon points={points} />
          </clipPath>
        ))}
      </defs>
      {RAYS.map((d, i) => (
        <path key={d} d={d} className="mark-piece" style={step(i)} />
      ))}
      {WEDGES.map((points, i) => (
        <path
          key={points}
          d={BODY}
          clipPath={`url(#${id}w${i})`}
          className="mark-piece"
          style={step(RAYS.length + i)}
        />
      ))}
    </svg>
  );
}
