import { Hono } from "hono";
import { videoJobQueue } from "../utils/video-job-queue";
import { stream } from "hono/streaming";
import logger from "../utils/logger";

const queueEvents = new Hono();

interface SSEClient {
  id: string;
  stream: any; // Hono stream helper object
  lastHeartbeat: number;
}

const clients: Map<string, SSEClient> = new Map();

/**
 * Send SSE message to a client
 */
function sendSSE(client: SSEClient, event: string, data: any): void {
  try {
    const message = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    client.stream.write(message);
  } catch (error) {
    logger.error({ error, clientId: client.id }, "Failed to send SSE message");
  }
}

/**
 * Broadcast SSE message to all clients
 */
function broadcast(event: string, data: any): void {
  for (const client of clients.values()) {
    sendSSE(client, event, data);
  }
}

/**
 * GET /queue/events - Server-Sent Events stream for queue updates
 */
queueEvents.get("/", (c) => {
  const clientId = Math.random().toString(36).substring(7);
  
  logger.info({ clientId }, "New SSE client connected");

  // Set SSE headers
  c.header('Content-Type', 'text/event-stream');
  c.header('Cache-Control', 'no-cache');
  c.header('Connection', 'keep-alive');
  c.header('X-Accel-Buffering', 'no'); // Disable nginx buffering

  return stream(c, async (stream) => {
    const client: SSEClient = {
      id: clientId,
      stream: stream,
      lastHeartbeat: Date.now(),
    };
    
    clients.set(clientId, client);

    // Send initial connection message
    sendSSE(client, "connected", { clientId });

    // Setup event listeners for job updates
    const onJobCreated = (job: any) => {
      sendSSE(client, "job:created", {
        jobId: job.id,
        filePath: job.filePath,
        status: job.status,
        priority: job.priority || 2,
      });
    };

    const onJobStarted = (job: any) => {
      sendSSE(client, "job:started", {
        jobId: job.id,
        filePath: job.filePath,
        status: job.status,
      });
    };

    const onJobProgress = (job: any, progress: number) => {
      sendSSE(client, "job:progress", {
        jobId: job.id,
        progress,
      });
    };

    const onJobCompleted = (job: any) => {
      sendSSE(client, "job:completed", {
        jobId: job.id,
        filePath: job.filePath,
        status: job.status,
      });
    };

    const onJobError = (job: any, error: Error) => {
      sendSSE(client, "job:error", {
        jobId: job.id,
        filePath: job.filePath,
        status: job.status,
        error: error.message,
      });
    };

    // Register event listeners
    videoJobQueue.on("job:created", onJobCreated);
    videoJobQueue.on("job:started", onJobStarted);
    videoJobQueue.on("job:progress", onJobProgress);
    videoJobQueue.on("job:completed", onJobCompleted);
    videoJobQueue.on("job:error", onJobError);

    // Heartbeat interval to keep connection alive
    const heartbeatInterval = setInterval(() => {
      try {
        sendSSE(client, "heartbeat", { timestamp: Date.now() });
        client.lastHeartbeat = Date.now();
      } catch (error) {
        // Connection closed, cleanup
        clearInterval(heartbeatInterval);
        clients.delete(clientId);
        logger.info({ clientId }, "SSE client disconnected (heartbeat failed)");
      }
    }, 30000); // 30 seconds

    // Keep connection alive - use onAbort to detect when client disconnects
    await new Promise<void>((resolve) => {
      stream.onAbort(() => {
        resolve();
      });
    }).finally(() => {
      // Cleanup
      clearInterval(heartbeatInterval);
      clients.delete(clientId);
      
      // Remove event listeners
      videoJobQueue.off("job:created", onJobCreated);
      videoJobQueue.off("job:started", onJobStarted);
      videoJobQueue.off("job:progress", onJobProgress);
      videoJobQueue.off("job:completed", onJobCompleted);
      videoJobQueue.off("job:error", onJobError);
      
      logger.info({ clientId }, "SSE client disconnected");
    });
  });
});

export default queueEvents;

