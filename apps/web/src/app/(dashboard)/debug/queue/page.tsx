"use client";

import { useState, useEffect } from "react";
import { QueueStatsCards } from "@/components/queue/queue-stats-cards";
import { QueueTable, type QueueJob } from "@/components/queue/queue-table";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RefreshCw } from "lucide-react";
import { useQueueEvents } from "@/hooks/use-queue-events";

export default function QueuePage() {
  const [jobs, setJobs] = useState<QueueJob[]>([]);
  const [stats, setStats] = useState({
    total: 0,
    pending: 0,
    processing: 0,
    completed: 0,
    error: 0,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [selectedFilter, setSelectedFilter] = useState<string>("all");
  
  // Use SSE for real-time updates
  const { jobStatuses, isConnected } = useQueueEvents(true);

  const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL || "";

  const fetchStats = async () => {
    try {
      const response = await fetch(`${apiBaseUrl}/queue/stats`, {
        credentials: "include",
      });
      if (response.ok) {
        const data = await response.json();
        setStats(data);
      }
    } catch (error) {
      console.error("Failed to fetch stats:", error);
    }
  };

  const fetchJobs = async () => {
    setIsLoading(true);
    try {
      const url =
        selectedFilter === "all"
          ? `${apiBaseUrl}/queue/jobs?limit=100`
          : `${apiBaseUrl}/queue/jobs?status=${selectedFilter}&limit=100`;

      const response = await fetch(url, {
        credentials: "include",
      });

      if (response.ok) {
        const data = await response.json();
        setJobs(data.jobs);
      }
    } catch (error) {
      console.error("Failed to fetch jobs:", error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchStats();
    fetchJobs();

    // Refresh every 5 seconds
    const interval = setInterval(() => {
      fetchStats();
      fetchJobs();
    }, 5000);

    return () => clearInterval(interval);
  }, [selectedFilter]);

  const handleRefresh = () => {
    fetchStats();
    fetchJobs();
  };

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Video Queue</h1>
          <p className="text-muted-foreground">
            Monitor and manage video processing jobs
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isConnected && (
            <div className="flex items-center gap-2 text-sm text-green-600">
              <div className="h-2 w-2 rounded-full bg-green-600 animate-pulse" />
              <span>Live</span>
            </div>
          )}
          <Button onClick={handleRefresh} variant="outline" size="sm">
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
        </div>
      </div>

      <QueueStatsCards stats={stats} />

      <Tabs value={selectedFilter} onValueChange={setSelectedFilter}>
        <TabsList>
          <TabsTrigger value="all">All</TabsTrigger>
          <TabsTrigger value="pending">Pending</TabsTrigger>
          <TabsTrigger value="processing">Processing</TabsTrigger>
          <TabsTrigger value="completed">Completed</TabsTrigger>
          <TabsTrigger value="error">Failed</TabsTrigger>
        </TabsList>

        <TabsContent value={selectedFilter} className="mt-6">
          {isLoading ? (
            <div className="flex items-center justify-center h-64">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900" />
            </div>
          ) : (
            <QueueTable jobs={jobs} onActionComplete={handleRefresh} />
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
