import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, protectedProcedure, router } from "./_core/trpc";
import { z } from "zod";
import { invokeLLM } from "./_core/llm";
import { savePostAnalysis, getPostAnalysis } from "./db";
import { TRPCError } from "@trpc/server";
import { normalizePost, normalizeInsights } from "./instagram";

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
     */
    getPosts: protectedProcedure
      .input(
        z.object({
          limit: z.number().min(1).max(20).default(10),
          pageCursor: z.string().optional(),
        })
      )
      .query(async ({ input }) => {
        try {
          // Call Instagram MCP to get posts
          const response = await fetch(
            `${process.env.BUILT_IN_FORGE_API_URL}/mcp/call`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${process.env.BUILT_IN_FORGE_API_KEY}`,
              },
              body: JSON.stringify({
                server: "instagram",
                tool: "get_post_list",
                input: {
                  limit: input.limit,
                  page_cursor: input.pageCursor,
                },
              }),
            }
          );

          if (!response.ok) {
            const errorText = await response.text();
            console.error("[Instagram] API error:", errorText);
            throw new TRPCError({
              code: "INTERNAL_SERVER_ERROR",
              message: "Failed to fetch Instagram posts. Please check your Instagram connection.",
            });
          }

          const data = await response.json();

          // Normalize posts
          const normalizedPosts = (data?.data || []).map((post: any) => normalizePost(post));

          return {
            posts: normalizedPosts,
            nextCursor: data?.paging?.cursors?.after,
          };
        } catch (error) {
          console.error("[Instagram] Failed to fetch posts:", error);
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: error instanceof Error ? error.message : "Failed to fetch Instagram posts",
          });
        }
      }),

    /**
     * Get insights for a specific Instagram post
     */
    getPostInsights: protectedProcedure
      .input(
        z.object({
          postId: z.string(),
        })
      )
      .query(async ({ input }) => {
        try {
          const response = await fetch(
            `${process.env.BUILT_IN_FORGE_API_URL}/mcp/call`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${process.env.BUILT_IN_FORGE_API_KEY}`,
              },
              body: JSON.stringify({
                server: "instagram",
                tool: "get_post_insights",
                input: {
                  post_id: input.postId,
                },
              }),
            }
          );

          if (!response.ok) {
            const errorText = await response.text();
            console.error("[Instagram] Insights API error:", errorText);
            throw new TRPCError({
              code: "INTERNAL_SERVER_ERROR",
              message: "Failed to fetch post insights",
            });
          }

          const data = await response.json();
          const insights = data?.data?.[0] || {};
          return normalizeInsights(insights);
        } catch (error) {
          console.error("[Instagram] Failed to fetch post insights:", error);
          // Return empty insights on error instead of throwing
          return {
            likeCount: 0,
            commentsCount: 0,
            reach: 0,
            impressions: 0,
          };
        }
      }),

    /**
     * Analyze a post with AI to generate description and category
     */
    analyzePost: protectedProcedure
      .input(
        z.object({
          postId: z.string(),
          caption: z.string(),
          mediaType: z.enum(["post", "reel", "story", "carousel"]),
        })
      )
      .mutation(async ({ input, ctx }) => {
        try {
          // Check if analysis already exists in cache
          const cached = await getPostAnalysis(ctx.user.id, input.postId);
          if (cached && cached.description && cached.script) {
            return {
              description: cached.description,
              contentCategory: cached.contentCategory || "uncategorized",
              script: cached.script,
            };
          }

          // Generate AI analysis
          const prompt = `You are an expert content analyst. Analyze this Instagram ${input.mediaType} and provide:
1. A natural language description of what the content is about (2-3 sentences)
2. A content category (one of: educational, promotional, entertainment, inspirational, tutorial, personal, other)
3. A full content script or narration based on the caption and media type

Caption: "${input.caption}"

Respond in JSON format with keys: description, contentCategory, script`;

          const response = await invokeLLM({
            messages: [
              {
                role: "system",
                content:
                  "You are a professional content analyst. Provide insightful, accurate analysis.",
              },
              {
                role: "user",
                content: prompt,
              },
            ],
            response_format: {
              type: "json_object",
            },
          });

          const content = response.choices[0]?.message.content;
          if (typeof content !== "string") {
            throw new Error("Invalid LLM response format");
          }

          const analysis = JSON.parse(content);

          // Cache the analysis
          await savePostAnalysis({
            userId: ctx.user.id,
            instagramPostId: input.postId,
            description: analysis.description,
            contentCategory: analysis.contentCategory,
            script: analysis.script,
          });

          return {
            description: analysis.description,
            contentCategory: analysis.contentCategory,
            script: analysis.script,
          };
        } catch (error) {
          console.error("[Instagram] Failed to analyze post:", error);
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Failed to analyze post",
          });
        }
      }),
  }),
});

export type AppRouter = typeof appRouter;
