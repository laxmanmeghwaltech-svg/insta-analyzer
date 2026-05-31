/**
 * Instagram MCP API service layer
 * Centralizes all Instagram API calls with error handling and caching integration.
 */

import { ENV } from "./_core/env";
import { normalizePost, normalizeInsights, type NormalizedPost, type PostInsights } from "./instagram";
import { getCached, setCached, makeCacheKey, CACHE_TTL } from "./cache";
import { savePostInsights, getCachedPostInsights } from "./db";
import { TRPCError } from "@trpc/server";

/**
 * Call the Instagram MCP tool
 */
async function callInstagramMcp(tool: string, input: Record<string, unknown>): Promise<any> {
  const forgeUrl = ENV.forgeApiUrl;
  const forgeKey = ENV.forgeApiKey;

  if (!forgeUrl || !forgeKey) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "Instagram integration is not configured. Please set BUILT_IN_FORGE_API_URL and BUILT_IN_FORGE_API_KEY.",
    });
  }

  const response = await fetch(`${forgeUrl}/mcp/call`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${forgeKey}`,
    },
    body: JSON.stringify({
      server: "instagram",
      tool,
      input,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`[Instagram MCP] ${tool} failed:`, response.status, errorText);

    if (response.status === 401) {
      throw new TRPCError({
        code: "UNAUTHORIZED",
        message: "Instagram authentication expired. Please reconnect your Instagram account.",
      });
    }

    if (response.status === 429) {
      throw new TRPCError({
        code: "TOO_MANY_REQUESTS",
        message: "Instagram API rate limit reached. Please try again in a few minutes.",
      });
    }

    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: `Instagram API error: ${response.status}`,
    });
  }

  return response.json();
}

/**
 * Fetch Instagram posts with caching
 */
export async function fetchPosts(
  userId: number,
  limit: number = 10,
  pageCursor?: string
): Promise<{ posts: NormalizedPost[]; nextCursor?: string }> {
  const cacheKey = makeCacheKey("posts", String(userId), String(limit), pageCursor || "first");

  // Check cache first
  const cached = await getCached<{ posts: NormalizedPost[]; nextCursor?: string }>(cacheKey);
  if (cached) {
    return cached;
  }

  try {
    const data = await callInstagramMcp("get_post_list", {
      limit,
      page_cursor: pageCursor,
    });

    const normalizedPosts = (data?.data || []).map((post: any) => normalizePost(post));
    const result = {
      posts: normalizedPosts,
      nextCursor: data?.paging?.cursors?.after,
    };

    // Cache the result
    await setCached(cacheKey, result, CACHE_TTL.POSTS, userId);

    return result;
  } catch (error) {
    if (error instanceof TRPCError) throw error;
    console.error("[Instagram] Failed to fetch posts:", error);
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: error instanceof Error ? error.message : "Failed to fetch Instagram posts",
    });
  }
}

/**
 * Fetch a single post by ID
 * Since Instagram MCP doesn't have a direct "get by ID" endpoint,
 * we search through the user's posts or use cached data.
 */
export async function fetchPostById(
  userId: number,
  postId: string
): Promise<NormalizedPost | null> {
  // First check cache for any posts list that might contain this post
  const cacheKey = makeCacheKey("post", String(userId), postId);
  const cached = await getCached<NormalizedPost>(cacheKey);
  if (cached) {
    return cached;
  }

  try {
    // Try to find the post in the user's recent posts
    const { posts } = await fetchPosts(userId, 20);
    const found = posts.find(p => p.id === postId);

    if (found) {
      // Cache the individual post
      await setCached(cacheKey, found, CACHE_TTL.POSTS, userId);
      return found;
    }

    // If not found in recent posts, try a deeper search
    let cursor: string | undefined;
    let allPosts: NormalizedPost[] = [...posts];
    let attempts = 0;
    const maxAttempts = 5;

    while (attempts < maxAttempts) {
      const morePosts = await fetchPosts(userId, 20, cursor);
      const foundInMore = morePosts.posts.find(p => p.id === postId);

      if (foundInMore) {
        await setCached(cacheKey, foundInMore, CACHE_TTL.POSTS, userId);
        return foundInMore;
      }

      allPosts = [...allPosts, ...morePosts.posts];
      if (!morePosts.nextCursor) break;
      cursor = morePosts.nextCursor;
      attempts++;
    }

    return null;
  } catch (error) {
    console.error("[Instagram] Failed to fetch post by ID:", error);
    return null;
  }
}

/**
 * Fetch post insights with caching
 */
export async function fetchPostInsights(
  userId: number,
  postId: string
): Promise<PostInsights> {
  // Check database cache first (insights change slowly)
  const cachedInsights = await getCachedPostInsights(userId, postId);
  if (cachedInsights) {
    const fetchedAt = cachedInsights.fetchedAt;
    const cacheAge = Date.now() - fetchedAt.getTime();
    // Use DB cache if less than 10 minutes old
    if (cacheAge < CACHE_TTL.INSIGHTS) {
      // Calculate engagement rate
      const totalEngagement = cachedInsights.likeCount + cachedInsights.commentsCount +
        (cachedInsights.savedCount || 0) + (cachedInsights.sharesCount || 0);
      const audienceSize = cachedInsights.reach > 0 ? cachedInsights.reach : cachedInsights.impressions;
      const engagementRate = audienceSize > 0
        ? Math.round((totalEngagement / audienceSize) * 10000) / 100
        : 0;

      return {
        likeCount: cachedInsights.likeCount,
        commentsCount: cachedInsights.commentsCount,
        reach: cachedInsights.reach,
        impressions: cachedInsights.impressions,
        savedCount: cachedInsights.savedCount || 0,
        sharesCount: cachedInsights.sharesCount || 0,
        engagementRate,
      };
    }
  }

  try {
    const data = await callInstagramMcp("get_post_insights", {
      post_id: postId,
    });

    const rawInsights = data?.data?.[0] || {};
    const insights = normalizeInsights(rawInsights);

    // Cache insights in DB
    await savePostInsights({
      userId,
      instagramPostId: postId,
      likeCount: insights.likeCount,
      commentsCount: insights.commentsCount,
      reach: insights.reach,
      impressions: insights.impressions,
      savedCount: insights.savedCount,
      sharesCount: insights.sharesCount,
    });

    return insights;
  } catch (error) {
    console.error("[Instagram] Failed to fetch post insights:", error);

    // If we have stale cached data, return it instead of failing
    if (cachedInsights) {
      return {
        likeCount: cachedInsights.likeCount,
        commentsCount: cachedInsights.commentsCount,
        reach: cachedInsights.reach,
        impressions: cachedInsights.impressions,
        savedCount: cachedInsights.savedCount || 0,
        sharesCount: cachedInsights.sharesCount || 0,
        engagementRate: 0,
      };
    }

    // Return empty insights on error instead of throwing
    return {
      likeCount: 0,
      commentsCount: 0,
      reach: 0,
      impressions: 0,
      savedCount: 0,
      sharesCount: 0,
      engagementRate: 0,
    };
  }
}

/**
 * Fetch insights for multiple posts (batch operation)
 */
export async function fetchBatchInsights(
  userId: number,
  postIds: string[]
): Promise<Map<string, PostInsights>> {
  const results = new Map<string, PostInsights>();

  // Process in parallel with a concurrency limit
  const concurrencyLimit = 3;
  const batches: string[][] = [];
  for (let i = 0; i < postIds.length; i += concurrencyLimit) {
    batches.push(postIds.slice(i, i + concurrencyLimit));
  }

  for (const batch of batches) {
    const promises = batch.map(async (postId) => {
      const insights = await fetchPostInsights(userId, postId);
      results.set(postId, insights);
    });

    await Promise.allSettled(promises);
  }

  return results;
}
