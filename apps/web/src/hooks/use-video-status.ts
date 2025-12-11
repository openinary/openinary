"use client";

import { useState, useEffect, useRef } from "react";

export type VideoStatus = "unknown" | "processing" | "ready" | "error";

interface VideoStatusResponse {
  status: "pending" | "processing" | "completed" | "error" | "not_found";
  progress?: number;
  error?: string;
}

export function useVideoStatus(videoPath: string | null, enabled: boolean = true) {
  const [status, setStatus] = useState<VideoStatus>("unknown");
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastStatusRef = useRef<VideoStatus>("unknown");
  const checkCountRef = useRef<number>(0);
  const maxInitialChecks = 10; // Check at least 10 times (20 seconds) even if status is unknown
  // This allows time for the job to be created when the video is first accessed

  useEffect(() => {
    if (!videoPath || !enabled) {
      setStatus("unknown");
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      checkCountRef.current = 0;
      lastStatusRef.current = "unknown";
      return;
    }

    // Reset state when video path changes
    checkCountRef.current = 0;
    lastStatusRef.current = "unknown";
    setStatus("unknown");
    setProgress(0);
    setError(null);

    const checkStatus = async () => {
      try {
        const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL || "";
        const response = await fetch(`${apiBaseUrl}/video-status/${videoPath}`, {
          credentials: "include",
        });

        if (response.ok) {
          const data: VideoStatusResponse = await response.json();
          
          let newStatus: VideoStatus = "unknown";
          
          switch (data.status) {
            case "pending":
            case "processing":
              newStatus = "processing";
              setProgress(data.progress || 0);
              break;
            case "completed":
              newStatus = "ready";
              setProgress(100);
              // Stop polling when completed
              if (intervalRef.current) {
                clearInterval(intervalRef.current);
                intervalRef.current = null;
              }
              break;
            case "error":
              newStatus = "error";
              setError(data.error || "Processing failed");
              // Stop polling on error
              if (intervalRef.current) {
                clearInterval(intervalRef.current);
                intervalRef.current = null;
              }
              break;
            case "not_found":
              newStatus = "unknown";
              break;
          }
          
          // Only update if status changed to avoid unnecessary re-renders
          if (newStatus !== lastStatusRef.current) {
            setStatus(newStatus);
            lastStatusRef.current = newStatus;
          }
        } else if (response.status === 404) {
          // No job found - might be ready or not started
          // Don't update status immediately to avoid flickering
          // The status will be updated on the next check if a job is created
        }
      } catch (err) {
        console.error("Failed to check video status:", err);
        // Don't update status on network errors
      } finally {
        checkCountRef.current++;
      }
    };

    // Initial check with a small delay to allow job creation to complete
    // This ensures the job exists when we first check
    timeoutRef.current = setTimeout(() => {
      checkStatus();
    }, 100); // 100ms delay to allow job creation

    // Poll every 2 seconds
    // Continue polling if:
    // - Status is "processing" (active processing)
    // - Status is "unknown" and we haven't checked enough times yet (might be cached or job not created yet)
    intervalRef.current = setInterval(() => {
      const shouldContinuePolling = 
        lastStatusRef.current === "processing" ||
        (lastStatusRef.current === "unknown" && checkCountRef.current < maxInitialChecks);
      
      if (shouldContinuePolling) {
        checkStatus();
      } else if (lastStatusRef.current === "unknown" && checkCountRef.current >= maxInitialChecks) {
        // After max initial checks, switch to slower polling (every 10 seconds)
        // This allows detection of jobs created when video is accessed later
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
          
          // Set up slower periodic check in case the job gets created when video is accessed
          intervalRef.current = setInterval(() => {
            checkStatus();
            // If status changes from unknown, restart normal polling
            if (lastStatusRef.current !== "unknown") {
              if (intervalRef.current) {
                clearInterval(intervalRef.current);
                intervalRef.current = null;
              }
              // Restart normal polling for processing status
              if (lastStatusRef.current === "processing") {
                intervalRef.current = setInterval(() => {
                  if (lastStatusRef.current === "processing") {
                    checkStatus();
                  } else {
                    // Status changed to ready/error, stop polling
                    if (intervalRef.current) {
                      clearInterval(intervalRef.current);
                      intervalRef.current = null;
                    }
                  }
                }, 2000);
              }
            }
          }, 10000); // Check every 10 seconds
        }
      }
    }, 2000);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      checkCountRef.current = 0;
    };
  }, [videoPath, enabled]);

  return { status, progress, error };
}





