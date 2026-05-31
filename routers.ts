import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, protectedProcedure, router } from "./_core/trpc";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { fetchPosts, fetchPostById, fetchPostInsights, fetchBatchInsights } from "./instagramService";
import { analyzePost, generateContentStrategy, type AnalysisResult } from "./analysisService";
import { getAggregatedAnalytics, getAllPostAnalyses, getAllPostInsights } from "./db";
import { checkRateLimit, RATE_LIMITS } from "./rateLimiter";
import { invalidateCache, makeCacheKey } from "./cache";
import { calculateBestPostingTime, type NormalizedPost, type PostInsights } from "./instagram";

/**
 * Helper to check rate limits and throw if exceeded
 */
function enforceRateLimit(key: string, config: typeof RATE_LIMITS.API) {
  const result = checkRateLimit(key, config);
  if (!result.allowed) {
    throw new TRPCError({
      code: "TOO_MANY_REQUESTS",
      message: `Rate limit exceeded. Try again after ${Math.ceil((result.resetAt - Date.now()) / 1000)} seconds.`,
    });
  }
}

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return {
        success: true,
      } as const;
    }),
  }),

  instagram: router({
    /**
     * Fetch recent Instagram posts for the authenticated user
     * Enhanced with caching and rate limiting
     */
    getPosts: protectedProcedure
      .input(
        z.object({
          limit: z.number().min(1).max(25).default(10),
          pageCursor: z.string().optional(),
        })
      )
      .query(async ({ input, ctx }) => {
        const rateLimitKey = `posts:${ctx.user.id}`;
        enforceRateLimit(rateLimitKey, RATE_LIMITS.API);

        return fetchPosts(ctx.user.id, input.limit, input.pageCursor);
      }),

    /**
     * Get a single post by ID
     * New endpoint to support PostDetail page
     */
    getPostById: protectedProcedure
      .input(
        z.object({
          postId: z.string().min(1),
        })
      )
      .query(async ({ input, ctx }) => {
        const rateLimitKey = `post:${ctx.user.id}`;
        enforceRateLimit(rateLimitKey, RATE_LIMITS.API);

        const post = await fetchPostById(ctx.user.id, input.postId);

        if (!post) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Post not found. It may have been deleted or is not accessible.",
          });
        }

        return post;
      }),

    /**
     * Get insights for a specific Instagram post
     * Enhanced with DB caching and engagement rate calculation
     */
    getPostInsights: protectedProcedure
      .input(
        z.object({
          postId: z.string().min(1),
        })
      )
      .query(async ({ input, ctx }) => {
        const rateLimitKey = `insights:${ctx.user.id}`;
        enforceRateLimit(rateLimitKey, RATE_LIMITS.API);

        return fetchPostInsights(ctx.user.id, input.postId);
      }),

    /**
     * Get insights for multiple posts at once (batch)
     * New endpoint for efficient bulk data loading
     */
    getBatchInsights: protectedProcedure
      .input(
        z.object({
          postIds: z.array(z.string().min(1)).min(1).max(10),
        })
      )
      .query(async ({ input, ctx }) => {
        const rateLimitKey = `batch:${ctx.user.id}`;
        enforceRateLimit(rateLimitKey, RATE_LIMITS.BATCH);

        const insightsMap = await fetchBatchInsights(ctx.user.id, input.postIds);

        // Convert Map to plain object for tRPC serialization
        const result: Record<string, PostInsights> = {};
        for (const [postId, insights] of insightsMap) {
          result[postId] = insights;
        }

        return result;
      }),

    /**
     * Analyze a post with AI to generate description, category, script, and recommendations
     * Enhanced with hashtag extraction, sentiment analysis, re-analysis support,
     * and robust response validation
     */
    analyzePost: protectedProcedure
      .input(
        z.object({
          postId: z.string().min(1),
          caption: z.string(),
          mediaType: z.enum(["post", "reel", "story", "carousel"]),
          forceReanalyze: z.boolean().default(false),
        })
      )
      .mutation(async ({ input, ctx }) => {
        const rateLimitKey = `analysis:${ctx.user.id}`;
        enforceRateLimit(rateLimitKey, RATE_LIMITS.ANALYSIS);

        // Optionally fetch insights to provide context to the AI
        let insights: PostInsights | undefined;
        try {
          insights = await fetchPostInsights(ctx.user.id, input.postId);
        } catch {
          // Insights are optional context, don't block analysis
        }

        return analyzePost(ctx.user.id, input.postId, input.caption, input.mediaType, {
          forceReanalyze: input.forceReanalyze,
          insights,
        });
      }),

    /**
     * Batch analyze multiple posts
     * New endpoint for efficient bulk analysis
     */
    batchAnalyzePosts: protectedProcedure
      .input(
        z.object({
          posts: z.array(
            z.object({
              postId: z.string().min(1),
              caption: z.string(),
              mediaType: z.enum(["post", "reel", "story", "carousel"]),
            })
          ).min(1).max(5),
          forceReanalyze: z.boolean().default(false),
        })
      )
      .mutation(async ({ input, ctx }) => {
        const rateLimitKey = `batch-analysis:${ctx.user.id}`;
        enforceRateLimit(rateLimitKey, RATE_LIMITS.BATCH);

        const results: Record<string, AnalysisResult> = {};
        const errors: string[] = [];

        // Process sequentially to avoid overwhelming the LLM
        for (const post of input.posts) {
          try {
            const analysis = await analyzePost(
              ctx.user.id,
              post.postId,
              post.caption,
              post.mediaType,
              { forceReanalyze: input.forceReanalyze }
            );
            results[post.postId] = analysis;
          } catch (error) {
            const msg = error instanceof Error ? error.message : "Analysis failed";
            errors.push(`${post.postId}: ${msg}`);
          }
        }

        return { results, errors };
      }),

    /**
     * Get analytics overview for the user's Instagram account
     * New endpoint providing aggregated metrics and insights
     */
    getAnalyticsOverview: protectedProcedure
      .query(async ({ ctx }) => {
        const rateLimitKey = `analytics:${ctx.user.id}`;
        enforceRateLimit(rateLimitKey, RATE_LIMITS.API);

        const analytics = await getAggregatedAnalytics(ctx.user.id);

        if (!analytics) {
          return {
            insights: null,
            categories: [],
            sentiments: [],
            topHashtags: [],
            contentStrategy: "",
          };
        }

        // Generate a content strategy recommendation if we have enough data
        let contentStrategy = "";
        if (analytics.insights && analytics.insights.postCount > 3) {
          contentStrategy = await generateContentStrategy(
            ctx.user.id,
            analytics.categories,
            analytics.topHashtags,
            analytics.insights.avgEngagementRate
          );
        }

        return {
          insights: analytics.insights,
          categories: analytics.categories,
          sentiments: analytics.sentiments,
          topHashtags: analytics.topHashtags,
          contentStrategy,
        };
      }),

    /**
     * Get best posting times based on historical engagement data
     * New endpoint for posting time optimization
     */
    getBestPostingTimes: protectedProcedure
      .query(async ({ ctx }) => {
        const rateLimitKey = `posting-times:${ctx.user.id}`;
        enforceRateLimit(rateLimitKey, RATE_LIMITS.API);

        // Fetch recent posts and their insights
        const { posts } = await fetchPosts(ctx.user.id, 25);
        const postIds = posts.map(p => p.id);
        const insightsMap = await fetchBatchInsights(ctx.user.id, postIds);

        const bestTimes = calculateBestPostingTime(
          posts as NormalizedPost[],
          insightsMap
        );

        // Return top 5 best posting times
        return {
          bestTimes: bestTimes.slice(0, 5),
          totalPostsAnalyzed: posts.length,
        };
      }),

    /**
     * Invalidate cache for the user's Instagram data
     * Useful when user knows their data has changed
     */
    invalidateCache: protectedProcedure
      .input(
        z.object({
          type: z.enum(["posts", "insights", "analysis", "all"]).default("all"),
        })
      )
      .mutation(async ({ input, ctx }) => {
        const prefixes = input.type === "all"
          ? ["posts", "post", "insights", "analysis"]
          : [input.type];

        for (const prefix of prefixes) {
          const cacheKey = makeCacheKey(prefix, String(ctx.user.id));
          await invalidateCache(cacheKey);
        }

        return { success: true };
      }),
  }),
});

export type AppRouter = typeof appRouter;
