/**
 * Simple in-memory rate limiter for API protection.
 * Tracks request counts per user/IP and enforces limits.
 */

type RateLimitEntry = {
  count: number;
  resetAt: number;
};

const rateLimitStore = new Map<string, RateLimitEntry>();

export type RateLimitConfig = {
  /** Maximum number of requests allowed in the window */
  maxRequests: number;
  /** Time window in milliseconds */
  windowMs: number;
};

// Default rate limit configurations for different endpoint types
export const RATE_LIMITS = {
  // General API calls (posts, insights)
  API: { maxRequests: 60, windowMs: 60 * 1000 },          // 60/min
  // AI analysis is expensive - limit more strictly
  ANALYSIS: { maxRequests: 10, windowMs: 60 * 1000 },     // 10/min
  // Batch operations
  BATCH: { maxRequests: 5, windowMs: 60 * 1000 },         // 5/min
  // Authentication
  AUTH: { maxRequests: 10, windowMs: 60 * 1000 },         // 10/min
} as const;

export type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  resetAt: number;
};

/**
 * Check if a request is within rate limits
 * @param key - Unique identifier (user ID, IP, etc.)
 * @param config - Rate limit configuration
 * @returns Rate limit result with allowed status and remaining count
 */
export function checkRateLimit(key: string, config: RateLimitConfig): RateLimitResult {
  const now = Date.now();
  const entry = rateLimitStore.get(key);

  // No entry or expired window - start fresh
  if (!entry || now >= entry.resetAt) {
    const resetAt = now + config.windowMs;
    rateLimitStore.set(key, { count: 1, resetAt });
    return {
      allowed: true,
      remaining: config.maxRequests - 1,
      resetAt,
    };
  }

  // Within the current window
  if (entry.count < config.maxRequests) {
    entry.count++;
    return {
      allowed: true,
      remaining: config.maxRequests - entry.count,
      resetAt: entry.resetAt,
    };
  }

  // Rate limit exceeded
  return {
    allowed: false,
    remaining: 0,
    resetAt: entry.resetAt,
  };
}

/**
 * Reset rate limit for a specific key
 */
export function resetRateLimit(key: string): void {
  rateLimitStore.delete(key);
}

/**
 * Clean up expired rate limit entries (call periodically)
 */
export function cleanupRateLimits(): void {
  const now = Date.now();
  for (const [key, entry] of rateLimitStore.entries()) {
    if (now >= entry.resetAt) {
      rateLimitStore.delete(key);
    }
  }
}

// Clean up expired entries every minute
setInterval(cleanupRateLimits, 60 * 1000);
