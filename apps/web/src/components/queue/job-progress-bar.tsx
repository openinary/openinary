import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

interface JobProgressBarProps {
  progress: number;
  status?: string;
  className?: string;
}

export function JobProgressBar({ progress, status, className }: JobProgressBarProps) {
  const isCompleted = status === "completed";
  const isError = status === "error";

  return (
    <div className={cn("space-y-1", className)}>
      <Progress
        value={progress}
        className={cn(
          "h-2",
          isCompleted && "[&>div]:bg-green-500",
          isError && "[&>div]:bg-red-500"
        )}
      />
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>{progress}%</span>
        {isCompleted && <span className="text-green-600">Done</span>}
        {isError && <span className="text-red-600">Failed</span>}
      </div>
    </div>
  );
}

