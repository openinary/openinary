import { cn } from "@/lib/utils";

interface HoverLabelProps {
  name: string;
  visible: boolean;
}

export function HoverLabel({ name, visible }: HoverLabelProps) {
  return (
    <div
      className={cn(
        "absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent p-2 transition-opacity",
        visible ? "opacity-100" : "opacity-0",
      )}
    >
      <p className="text-white text-xs font-medium truncate">{name}</p>
    </div>
  );
}
