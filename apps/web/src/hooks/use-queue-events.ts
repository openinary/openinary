"use client";

import { useState, useEffect, useRef, useCallback } from "react";

export type QueueJobStatus = "pending" | "processing" | "completed" | "error" | "cancelled";

export interface QueueJob {
  jobId: string;
  filePath: string;
  status: QueueJobStatus;
  progress?: number;
  priority?: number;
  error?: string;
}

export interface QueueEventData {
  jobId: string;
  filePath?: string;
  status?: QueueJobStatus;
  progress?: number;
  priority?: number;
  error?: string;
}

/**
 * Hook to listen to real-time queue events via Server-Sent Events (SSE)
 * 
 * @param enabled - Whether to enable SSE connection
 * @returns Object with job statuses, connection state, and error
 */
export function useQueueEvents(enabled: boolean = true) {
  const [jobStatuses, setJobStatuses] = useState<Map<string, QueueJob>>(new Map());
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttempts = useRef(0);
  const maxReconnectAttempts = 5;
  const baseReconnectDelay = 1000; // Start with 1 second

  const updateJobStatus = useCallback((data: QueueEventData) => {
    setJobStatuses((prev) => {
      const updated = new Map(prev);
      const existing = updated.get(data.jobId);
      
      updated.set(data.jobId, {
        jobId: data.jobId,
        filePath: data.filePath || existing?.filePath || "",
        status: data.status || existing?.status || "pending",
        progress: data.progress !== undefined ? data.progress : existing?.progress,
        priority: data.priority !== undefined ? data.priority : existing?.priority,
        error: data.error || existing?.error,
      });
      
      return updated;
    });
  }, []);

  const connect = useCallback(() => {
    if (!enabled) return;

    const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL || "";
    const eventSourceUrl = `${apiBaseUrl}/queue/events`;

    try {
      const eventSource = new EventSource(eventSourceUrl, {
        withCredentials: true,
      });

      eventSource.onopen = () => {
        setIsConnected(true);
        setError(null);
        reconnectAttempts.current = 0;
      };

      eventSource.addEventListener("connected", (event) => {
        const data = JSON.parse(event.data);
        console.log("[SSE] Connected with client ID:", data.clientId);
      });

      eventSource.addEventListener("job:created", (event) => {
        const data: QueueEventData = JSON.parse(event.data);
        updateJobStatus(data);
      });

      eventSource.addEventListener("job:started", (event) => {
        const data: QueueEventData = JSON.parse(event.data);
        updateJobStatus(data);
      });

      eventSource.addEventListener("job:progress", (event) => {
        const data: QueueEventData = JSON.parse(event.data);
        updateJobStatus(data);
      });

      eventSource.addEventListener("job:completed", (event) => {
        const data: QueueEventData = JSON.parse(event.data);
        updateJobStatus(data);
      });

      eventSource.addEventListener("job:error", (event) => {
        const data: QueueEventData = JSON.parse(event.data);
        updateJobStatus(data);
      });

      eventSource.addEventListener("heartbeat", (event) => {
        // Keep-alive heartbeat, no action needed
      });

      eventSource.onerror = (err) => {
        console.error("[SSE] Connection error:", err);
        setIsConnected(false);
        setError("Connection lost");
        eventSource.close();

        // Attempt to reconnect with exponential backoff
        if (reconnectAttempts.current < maxReconnectAttempts) {
          const delay = baseReconnectDelay * Math.pow(2, reconnectAttempts.current);
          console.log(`[SSE] Reconnecting in ${delay}ms (attempt ${reconnectAttempts.current + 1}/${maxReconnectAttempts})`);
          
          reconnectTimeoutRef.current = setTimeout(() => {
            reconnectAttempts.current++;
            connect();
          }, delay);
        } else {
          setError("Failed to reconnect after multiple attempts");
        }
      };

      eventSourceRef.current = eventSource;
    } catch (err) {
      console.error("[SSE] Failed to create EventSource:", err);
      setError("Failed to connect to queue events");
    }
  }, [enabled, updateJobStatus]);

  const disconnect = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    setIsConnected(false);
  }, []);

  useEffect(() => {
    if (enabled) {
      connect();
    } else {
      disconnect();
    }

    return () => {
      disconnect();
    };
  }, [enabled, connect, disconnect]);

  return {
    jobStatuses,
    isConnected,
    error,
    getJobStatus: (jobId: string) => jobStatuses.get(jobId),
  };
}

