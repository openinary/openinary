import { cn } from "../lib/utils";

interface SpinnerProps {
  className?: string;
  size?: number;
  "aria-label"?: string;
}

export function Spinner({
  className,
  size = 24,
  "aria-label": ariaLabel = "Loading",
}: SpinnerProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      width={size}
      height={size}
      stroke="currentColor"
      role="status"
      aria-label={ariaLabel}
      className={cn("text-foreground", className)}
    >
      <circle cx="12" cy="12" r="9.5" fill="none" strokeWidth="2" strokeLinecap="round">
        <animateTransform
          attributeName="transform"
          type="rotate"
          from="0 12 12"
          to="360 12 12"
          dur="2s"
          repeatCount="indefinite"
        />
        <animate
          attributeName="stroke-dasharray"
          values="0 150;42 150;42 150"
          keyTimes="0;0.5;1"
          dur="1.5s"
          repeatCount="indefinite"
        />
        <animate
          attributeName="stroke-dashoffset"
          values="0;-16;-59"
          keyTimes="0;0.5;1"
          dur="1.5s"
          repeatCount="indefinite"
        />
      </circle>
      <circle cx="12" cy="12" r="9.5" fill="none" opacity={0.1} strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
