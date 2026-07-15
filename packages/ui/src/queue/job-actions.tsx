"use client";

import { Button } from "../ui/button";
import { RotateCcw, X, Trash2 } from "lucide-react";
import { useState } from "react";
import { useOpeninary } from "../provider/openinary-provider";

interface JobActionsProps {
  jobId: string;
  status: string;
  onActionComplete?: () => void;
}

export function JobActions({ jobId, status, onActionComplete }: JobActionsProps) {
  const { apiBaseUrl, fetch } = useOpeninary();
  const [isRetrying, setIsRetrying] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleRetry = async () => {
    setIsRetrying(true);
    try {
      const response = await fetch(`${apiBaseUrl}/queue/jobs/${jobId}/retry`, {
        method: "POST",
      });

      if (!response.ok) {
        throw new Error("Failed to retry job");
      }

      console.log("Job scheduled for retry");
      onActionComplete?.();
    } catch (error) {
      console.error("Failed to retry job", error);
    } finally {
      setIsRetrying(false);
    }
  };

  const handleCancel = async () => {
    setIsCancelling(true);
    try {
      const response = await fetch(`${apiBaseUrl}/queue/jobs/${jobId}/cancel`, {
        method: "POST",
      });

      if (!response.ok) {
        throw new Error("Failed to cancel job");
      }

      console.log("Job cancelled");
      onActionComplete?.();
    } catch (error) {
      console.error("Failed to cancel job", error);
    } finally {
      setIsCancelling(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm("Are you sure you want to delete this job?")) {
      return;
    }

    setIsDeleting(true);
    try {
      const response = await fetch(`${apiBaseUrl}/queue/jobs/${jobId}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        throw new Error("Failed to delete job");
      }

      console.log("Job deleted");
      onActionComplete?.();
    } catch (error) {
      console.error("Failed to delete job", error);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="flex gap-2">
      {status === "error" && (
        <Button
          size="sm"
          variant="outline"
          onClick={handleRetry}
          disabled={isRetrying}
        >
          <RotateCcw className="h-4 w-4 mr-1" />
          Retry
        </Button>
      )}
      {status === "pending" && (
        <Button
          size="sm"
          variant="outline"
          onClick={handleCancel}
          disabled={isCancelling}
        >
          <X className="h-4 w-4 mr-1" />
          Cancel
        </Button>
      )}
      {(status === "completed" || status === "error" || status === "cancelled") && (
        <Button
          size="sm"
          variant="ghost"
          onClick={handleDelete}
          disabled={isDeleting}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      )}
    </div>
  );
}
