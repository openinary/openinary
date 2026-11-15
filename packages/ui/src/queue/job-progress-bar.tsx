import { Progress } from "../ui/progress";
import { cn } from "../lib/utils";

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
          isCompleted && "[&>div]:bg-ds-green",
          isError && "[&>div]:bg-ds-red",
        )}
      />
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>{progress}%</span>
        {isCompleted && <span className="text-ds-green">Done</span>}
        {isError && <span className="text-ds-red">Failed</span>}
      </div>
    </div>
  );
}
