/**
 * In-memory + optional database caching layer for Instagram API responses.
 * Reduces redundant MCP API calls and improves response times.
 */

type CacheEntry<T> = {
  data: T;
  expiresAt: number;
};

// In-memory cache for fast access (falls back gracefully if DB not available)
const memoryCache = new Map<string, CacheEntry<unknown>>();

// Default TTL values for different cache types (in milliseconds)
export const CACHE_TTL = {
  POSTS: 5 * 60 * 1000,       // 5 minutes - posts don't change that often
  INSIGHTS: 10 * 60 * 1000,   // 10 minutes - insights update less frequently
  ANALYSIS: 60 * 60 * 1000,   // 1 hour - AI analysis is stable
  ACCOUNT: 30 * 60 * 1000,    // 30 minutes - account info changes rarely
} as const;

/**
 * Generate a cache key from components
 */
export function makeCacheKey(...parts: string[]): string {
  return parts.join(':');
}

/**
 * Get a value from cache (memory first, then DB)
 */
export async function getCached<T>(key: string): Promise<T | null> {
  // Check memory cache first
  const memEntry = memoryCache.get(key);
  if (memEntry) {
    if (Date.now() < memEntry.expiresAt) {
      return memEntry.data as T;
    }
    // Expired, remove from memory
    memoryCache.delete(key);
  }

  // Try database cache
  try {
    const { getDb } = await import('./db');
    const db = await getDb();
    if (!db) return null;

    const { apiCache } = await import('../drizzle/schema');
    const { eq, and, gt } = await import('drizzle-orm');

    const result = await db
      .select()
      .from(apiCache)
      .where(
        and(
          eq(apiCache.cacheKey, key),
          gt(apiCache.expiresAt, new Date())
        )
      )
      .limit(1);

    if (result.length > 0) {
      const parsed = JSON.parse(result[0].responseData) as T;
      // Also store in memory for faster subsequent access
      const expiresAt = result[0].expiresAt.getTime();
      memoryCache.set(key, { data: parsed, expiresAt });
      return parsed;
    }
  } catch (error) {
    // Cache miss is fine, don't throw
    console.warn('[Cache] DB cache lookup failed:', error);
  }

  return null;
}

/**
 * Set a value in cache (both memory and DB)
 */
export async function setCached<T>(
  key: string,
  data: T,
  ttlMs: number,
  userId?: number
): Promise<void> {
  const expiresAt = Date.now() + ttlMs;

  // Always set in memory
  memoryCache.set(key, { data, expiresAt });

  // Try to persist in DB if userId provided
  if (userId) {
    try {
      const { getDb } = await import('./db');
      const db = await getDb();
      if (!db) return;

      const { apiCache } = await import('../drizzle/schema');
      const expiresAtDate = new Date(expiresAt);

      await db.insert(apiCache).values({
        userId,
        cacheKey: key,
        responseData: JSON.stringify(data),
        expiresAt: expiresAtDate,
      }).onDuplicateKeyUpdate({
        set: {
          responseData: JSON.stringify(data),
          expiresAt: expiresAtDate,
        },
      });
    } catch (error) {
      // DB write failure shouldn't break the request
      console.warn('[Cache] DB cache write failed:', error);
    }
  }
}

/**
 * Invalidate a cache entry
 */
export async function invalidateCache(key: string): Promise<void> {
  memoryCache.delete(key);

  try {
    const { getDb } = await import('./db');
    const db = await getDb();
    if (!db) return;

    const { apiCache } = await import('../drizzle/schema');
    const { eq } = await import('drizzle-orm');

    await db.delete(apiCache).where(eq(apiCache.cacheKey, key));
  } catch (error) {
    console.warn('[Cache] DB cache invalidation failed:', error);
  }
}

/**
 * Clean up expired entries from memory cache (call periodically)
 */
export function cleanupMemoryCache(): void {
  const now = Date.now();
  for (const [key, entry] of memoryCache.entries()) {
    if (now >= entry.expiresAt) {
      memoryCache.delete(key);
    }
  }
}

// Run cleanup every 5 minutes
setInterval(cleanupMemoryCache, 5 * 60 * 1000);
