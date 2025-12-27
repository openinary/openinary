import { Context, Next } from "hono";
import logger from "../utils/logger";

/**
 * Rate limit entry stored in memory
 */
interface RateLimitEntry {
  count: number;
  resetAt: number;
}

/**
 * In-memory store for rate limit tracking
 * Key: IP address
 * Value: Rate limit entry with count and reset timestamp
 */
const rateLimitStore = new Map<string, RateLimitEntry>();

/**
 * Configuration for public rate limiting
 * Can be overridden via environment variables
 */
const RATE_LIMIT_MAX = parseInt(process.env.PUBLIC_RATE_LIMIT_MAX || "100", 10);
const RATE_LIMIT_WINDOW_MS = parseInt(process.env.PUBLIC_RATE_LIMIT_WINDOW_MS || "60000", 10);

/**
 * Paths that should be excluded from rate limiting
 * Empty by default - all public routes should be rate limited to prevent abuse
 */
const EXCLUDED_PATHS: string[] = [];

/**
 * Extract client IP address from request headers
 * Checks x-forwarded-for and x-real-ip headers (for reverse proxy scenarios)
 * Falls back to a default value if no IP can be determined
 */
function getClientIP(c: Context): string {
  const forwardedFor = c.req.header("x-forwarded-for");
  const realIP = c.req.header("x-real-ip");
  
  // x-forwarded-for can contain multiple IPs (client, proxy1, proxy2)
  // We take the first one which is the original client IP
  if (forwardedFor) {
    return forwardedFor.split(",")[0].trim();
  }
  
  if (realIP) {
    return realIP.trim();
  }
  
  // Fallback: use a default identifier if IP cannot be determined
  // This should rarely happen in production behind a reverse proxy
  return "unknown";
}

/**
 * Clean up expired entries from the rate limit store
 * This prevents memory leaks by removing entries that are no longer needed
 */
function cleanupExpiredEntries(): void {
  const now = Date.now();
  for (const [ip, entry] of rateLimitStore.entries()) {
    if (entry.resetAt < now) {
      rateLimitStore.delete(ip);
    }
  }
}

/**
 * Check if a path should be excluded from rate limiting
 */
function isExcludedPath(path: string): boolean {
  return EXCLUDED_PATHS.some((excluded) => path.startsWith(excluded));
}

/**
 * Public rate limiting middleware
 * 
 * Protects public routes from abuse by limiting requests per IP address.
 * Uses a sliding window approach: each IP gets a maximum number of requests
 * within a time window. Once the limit is exceeded, requests are blocked
 * with a 429 status code.
 * 
 * Configuration:
 * - PUBLIC_RATE_LIMIT_MAX: Maximum requests per window (default: 100)
 * - PUBLIC_RATE_LIMIT_WINDOW_MS: Time window in milliseconds (default: 60000 = 1 minute)
 * 
 * Headers returned:
 * - X-RateLimit-Limit: Maximum requests allowed
 * - X-RateLimit-Remaining: Remaining requests in current window
 * - X-RateLimit-Reset: Timestamp when the limit resets (Unix epoch in seconds)
 */
export async function publicRateLimit(c: Context, next: Next) {
  const path = c.req.path;
  
  // Skip rate limiting for excluded paths
  if (isExcludedPath(path)) {
    await next();
    return;
  }
  
  // Extract client IP
  const clientIP = getClientIP(c);
  
  // Skip rate limiting if IP cannot be determined (should be rare)
  if (clientIP === "unknown") {
    logger.warn({ path }, "Could not determine client IP for rate limiting");
    await next();
    return;
  }
  
  const now = Date.now();
  
  try {
    // Get or create rate limit entry for this IP
    let entry = rateLimitStore.get(clientIP);
    
    // If entry doesn't exist or has expired, create a new one
    if (!entry || entry.resetAt < now) {
      entry = {
        count: 0,
        resetAt: now + RATE_LIMIT_WINDOW_MS,
      };
      rateLimitStore.set(clientIP, entry);
    }
    
    // Increment request count
    entry.count++;
    
    // Check if limit is exceeded
    if (entry.count > RATE_LIMIT_MAX) {
      const resetTimestamp = Math.floor(entry.resetAt / 1000); // Convert to Unix seconds
      
      // Set rate limit headers
      c.header("X-RateLimit-Limit", RATE_LIMIT_MAX.toString());
      c.header("X-RateLimit-Remaining", "0");
      c.header("X-RateLimit-Reset", resetTimestamp.toString());
      
      // Log the rate limit violation
      logger.warn(
        {
          ip: clientIP,
          path,
          count: entry.count,
          limit: RATE_LIMIT_MAX,
        },
        "Rate limit exceeded for public route"
      );
      
      // Return 429 Too Many Requests
      return c.json(
        {
          error: "Too Many Requests",
          message: `Rate limit exceeded. Maximum ${RATE_LIMIT_MAX} requests per ${RATE_LIMIT_WINDOW_MS / 1000} seconds.`,
          retryAfter: Math.ceil((entry.resetAt - now) / 1000), // Seconds until reset
        },
        429
      );
    }
    
    // Calculate remaining requests
    const remaining = Math.max(0, RATE_LIMIT_MAX - entry.count);
    const resetTimestamp = Math.floor(entry.resetAt / 1000);
    
    // Set rate limit headers
    c.header("X-RateLimit-Limit", RATE_LIMIT_MAX.toString());
    c.header("X-RateLimit-Remaining", remaining.toString());
    c.header("X-RateLimit-Reset", resetTimestamp.toString());
    
    // Periodically clean up expired entries (every 100 requests to avoid overhead)
    if (rateLimitStore.size > 0 && Math.random() < 0.01) {
      cleanupExpiredEntries();
    }
    
    // Continue to next middleware/handler
    await next();
  } catch (error) {
    // If rate limiting fails, log but don't block the request
    // This ensures availability even if there's a bug in the rate limiter
    logger.error({ error, ip: clientIP, path }, "Error in rate limiting middleware");
    await next();
  }
}

