import { Badge } from "../ui/badge";
import { cn } from "../lib/utils";

export type JobStatus = "pending" | "processing" | "completed" | "error" | "cancelled";

interface JobStatusBadgeProps {
  status: JobStatus;
  className?: string;
}

export function JobStatusBadge({ status, className }: JobStatusBadgeProps) {
  const variants: Record<JobStatus, { variant: any; label: string }> = {
    pending: { variant: "secondary", label: "Pending" },
    processing: { variant: "default", label: "Processing" },
    completed: { variant: "default", label: "Completed" },
    error: { variant: "destructive", label: "Error" },
    cancelled: { variant: "outline", label: "Cancelled" },
  };

  const config = variants[status];

  return (
    <Badge
      variant={config.variant}
      className={cn(
        status === "completed" && "bg-ds-green hover:bg-ds-green",
        status === "processing" && "bg-ds-blue hover:bg-ds-blue",
        className,
      )}
    >
      {config.label}
    </Badge>
  );
}
