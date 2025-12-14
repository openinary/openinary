"use client";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { JobStatusBadge } from "./job-status-badge";
import { JobActions } from "./job-actions";

export interface QueueJob {
  id: string;
  file_path: string;
  status: "pending" | "processing" | "completed" | "error" | "cancelled";
  priority: number;
  progress: number;
  error: string | null;
  created_at: number;
  started_at: number | null;
  completed_at: number | null;
}

interface QueueTableProps {
  jobs: QueueJob[];
  onActionComplete?: () => void;
}

function formatDuration(startTime: number | null, endTime: number | null): string {
  if (!startTime) return "-";
  
  const end = endTime || Date.now();
  const duration = Math.floor((end - startTime) / 1000);
  
  if (duration < 60) return `${duration}s`;
  if (duration < 3600) return `${Math.floor(duration / 60)}m ${duration % 60}s`;
  return `${Math.floor(duration / 3600)}h ${Math.floor((duration % 3600) / 60)}m`;
}

function getPriorityLabel(priority: number): string {
  if (priority === 1) return "High";
  if (priority === 2) return "Normal";
  return "Low";
}

function formatTimeAgo(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  
  if (seconds < 60) return "just now";
  if (seconds < 3600) {
    const minutes = Math.floor(seconds / 60);
    return `${minutes}m ago`;
  }
  if (seconds < 86400) {
    const hours = Math.floor(seconds / 3600);
    return `${hours}h ago`;
  }
  const days = Math.floor(seconds / 86400);
  return `${days}d ago`;
}

export function QueueTable({ jobs, onActionComplete }: QueueTableProps) {
  if (jobs.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        <p>No jobs found</p>
      </div>
    );
  }

  return (
    <div className="border rounded-lg">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>File</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Priority</TableHead>
            <TableHead>Duration</TableHead>
            <TableHead>Created</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {jobs.map((job) => (
            <TableRow key={job.id}>
              <TableCell className="font-medium max-w-xs truncate">
                {job.file_path}
                {job.error && (
                  <div className="text-xs text-red-500 mt-1">{job.error}</div>
                )}
              </TableCell>
              <TableCell>
                <JobStatusBadge status={job.status} />
              </TableCell>
              <TableCell>
                <span
                  className={
                    job.priority === 1
                      ? "text-orange-600 font-medium"
                      : "text-muted-foreground"
                  }
                >
                  {getPriorityLabel(job.priority)}
                </span>
              </TableCell>
              <TableCell>
                {formatDuration(job.started_at, job.completed_at)}
              </TableCell>
              <TableCell className="text-muted-foreground">
                {formatTimeAgo(job.created_at)}
              </TableCell>
              <TableCell className="text-right">
                <JobActions
                  jobId={job.id}
                  status={job.status}
                  onActionComplete={onActionComplete}
                />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

