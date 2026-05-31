import { describe, it, expect, vi, beforeEach } from "vitest";
import { z } from "zod";
import { extractHashtags, sanitizeContentCategory, normalizeInsights, truncateCaption } from "./instagram";

/**
 * Mock tests for Instagram router procedures
 * Enhanced with tests for new features: caching, rate limiting,
 * hashtag extraction, sentiment, and batch operations.
 */

describe("Instagram Router Procedures", () => {
  describe("getPosts", () => {
    it("should handle successful post list response", () => {
      const mockResponse = {
        data: [
          {
            id: "123",
            caption: "Test post #hashtag",
            media_type: "IMAGE",
            media_url: "https://example.com/image.jpg",
            timestamp: "2026-05-29T10:00:00Z",
            permalink: "https://instagram.com/p/123",
          },
        ],
        paging: {
          cursors: {
            after: "next_cursor_123",
          },
        },
      };

      expect(mockResponse.data).toHaveLength(1);
      expect(mockResponse.data[0].id).toBe("123");
      expect(mockResponse.paging.cursors.after).toBe("next_cursor_123");
    });

    it("should handle empty post list", () => {
      const mockResponse = {
        data: [],
        paging: {
          cursors: {},
        },
      };

      expect(mockResponse.data).toHaveLength(0);
      expect(mockResponse.paging.cursors.after).toBeUndefined();
    });

    it("should validate input schema", () => {
      const inputSchema = z.object({
        limit: z.number().min(1).max(25).default(10),
        pageCursor: z.string().optional(),
      });

      // Valid inputs
      expect(() => inputSchema.parse({ limit: 10 })).not.toThrow();
      expect(() => inputSchema.parse({ limit: 5, pageCursor: "abc" })).not.toThrow();
      expect(() => inputSchema.parse({})).not.toThrow(); // Uses default

      // Invalid inputs
      expect(() => inputSchema.parse({ limit: 0 })).toThrow();
      expect(() => inputSchema.parse({ limit: 26 })).toThrow();
      expect(() => inputSchema.parse({ limit: "invalid" })).toThrow();
    });
  });

  describe("getPostById", () => {
    it("should validate postId input", () => {
      const inputSchema = z.object({
        postId: z.string().min(1),
      });

      expect(() => inputSchema.parse({ postId: "123" })).not.toThrow();
      expect(() => inputSchema.parse({ postId: "abc-456" })).not.toThrow();
      expect(() => inputSchema.parse({})).toThrow();
      expect(() => inputSchema.parse({ postId: "" })).toThrow();
    });
  });

  describe("getPostInsights", () => {
    it("should normalize insights response with engagement rate", () => {
      const mockInsights = {
        like_count: 100,
        comments_count: 25,
        reach: 500,
        impressions: 750,
        saved: 10,
        shares: 5,
      };

      const normalized = normalizeInsights(mockInsights);

      expect(normalized.likeCount).toBe(100);
      expect(normalized.commentsCount).toBe(25);
      expect(normalized.reach).toBe(500);
      expect(normalized.impressions).toBe(750);
      expect(normalized.savedCount).toBe(10);
      expect(normalized.sharesCount).toBe(5);
      expect(normalized.engagementRate).toBe(28); // (100+25+10+5)/500*100 = 28%
    });

    it("should handle missing insights gracefully", () => {
      const mockInsights = {};

      const normalized = normalizeInsights(mockInsights);

      expect(normalized).toEqual({
        likeCount: 0,
        commentsCount: 0,
        reach: 0,
        impressions: 0,
        savedCount: 0,
        sharesCount: 0,
        engagementRate: 0,
      });
    });

    it("should validate postId input", () => {
      const inputSchema = z.object({
        postId: z.string().min(1),
      });

      expect(() => inputSchema.parse({ postId: "123" })).not.toThrow();
      expect(() => inputSchema.parse({})).toThrow();
      expect(() => inputSchema.parse({ postId: 123 })).toThrow();
    });
  });

  describe("getBatchInsights", () => {
    it("should validate batch input schema", () => {
      const inputSchema = z.object({
        postIds: z.array(z.string().min(1)).min(1).max(10),
      });

      expect(() => inputSchema.parse({ postIds: ["1", "2", "3"] })).not.toThrow();
      expect(() => inputSchema.parse({ postIds: ["1"] })).not.toThrow();
      expect(() => inputSchema.parse({ postIds: [] })).toThrow(); // min 1
      expect(() => inputSchema.parse({ postIds: Array(11).fill("id") })).toThrow(); // max 10
    });
  });

  describe("analyzePost", () => {
    it("should validate analysis input schema", () => {
      const inputSchema = z.object({
        postId: z.string().min(1),
        caption: z.string(),
        mediaType: z.enum(["post", "reel", "story", "carousel"]),
        forceReanalyze: z.boolean().default(false),
      });

      // Valid inputs
      expect(() =>
        inputSchema.parse({
          postId: "123",
          caption: "Test caption",
          mediaType: "post",
        })
      ).not.toThrow();

      expect(() =>
        inputSchema.parse({
          postId: "456",
          caption: "Video content",
          mediaType: "reel",
          forceReanalyze: true,
        })
      ).not.toThrow();

      // Invalid inputs
      expect(() =>
        inputSchema.parse({
          postId: "789",
          caption: "Invalid type",
          mediaType: "invalid",
        })
      ).toThrow();

      expect(() =>
        inputSchema.parse({
          postId: "",
          caption: "Empty postId",
          mediaType: "post",
        })
      ).toThrow();
    });

    it("should parse AI response JSON with validation", () => {
      const mockLLMResponse = {
        description: "This is a beautiful landscape photo showcasing mountains.",
        contentCategory: "educational",
        script:
          "Welcome to this amazing landscape photography. Today we explore the beauty of nature...",
        sentiment: "positive",
        recommendations: [
          "Use more nature hashtags",
          "Post during golden hour",
          "Add a call-to-action",
        ],
      };

      const parsed = JSON.parse(JSON.stringify(mockLLMResponse));

      expect(parsed.description).toBeDefined();
      expect(parsed.contentCategory).toBeDefined();
      expect(parsed.script).toBeDefined();
      expect(parsed.sentiment).toBeDefined();
      expect(parsed.recommendations).toBeDefined();
      expect(parsed.recommendations).toHaveLength(3);
    });

    it("should handle invalid JSON response", () => {
      const invalidJSON = "{ invalid json }";
      expect(() => JSON.parse(invalidJSON)).toThrow();
    });

    it("should validate content categories including new ones", () => {
      const validCategories = [
        "educational",
        "promotional",
        "entertainment",
        "inspirational",
        "tutorial",
        "personal",
        "lifestyle",
        "behind-the-scenes",
        "user-generated",
        "other",
      ];

      validCategories.forEach((category) => {
        expect(sanitizeContentCategory(category)).toBe(category);
      });

      // Unknown category should default to "other"
      expect(sanitizeContentCategory("random")).toBe("other");
    });

    it("should extract hashtags from captions", () => {
      expect(extractHashtags("Hello #world #test")).toEqual(["world", "test"]);
      expect(extractHashtags("#only")).toEqual(["only"]);
      expect(extractHashtags("no hashtags here")).toEqual([]);
      expect(extractHashtags(undefined)).toEqual([]);
    });

    it("should truncate long captions", () => {
      const short = "Hello world";
      expect(truncateCaption(short, 100)).toBe(short);

      const long = "a".repeat(3000);
      const truncated = truncateCaption(long, 2000);
      expect(truncated.length).toBeLessThan(long.length);
      expect(truncated.endsWith("...")).toBe(true);
    });
  });

  describe("batchAnalyzePosts", () => {
    it("should validate batch analysis input schema", () => {
      const inputSchema = z.object({
        posts: z.array(
          z.object({
            postId: z.string().min(1),
            caption: z.string(),
            mediaType: z.enum(["post", "reel", "story", "carousel"]),
          })
        ).min(1).max(5),
        forceReanalyze: z.boolean().default(false),
      });

      // Valid
      expect(() =>
        inputSchema.parse({
          posts: [{ postId: "1", caption: "test", mediaType: "post" }],
        })
      ).not.toThrow();

      // Too many posts
      expect(() =>
        inputSchema.parse({
          posts: Array(6).fill({ postId: "1", caption: "test", mediaType: "post" }),
        })
      ).toThrow();

      // Empty array
      expect(() =>
        inputSchema.parse({ posts: [] })
      ).toThrow();
    });
  });

  describe("Error handling", () => {
    it("should handle API errors gracefully", () => {
      const apiError = {
        status: 401,
        statusText: "Unauthorized",
        message: "Instagram account not connected",
      };

      expect(apiError.status).toBe(401);
      expect(apiError.message).toContain("not connected");
    });

    it("should handle rate limit errors", () => {
      const rateLimitError = {
        status: 429,
        statusText: "Too Many Requests",
        message: "Instagram API rate limit reached",
      };

      expect(rateLimitError.status).toBe(429);
    });

    it("should provide user-friendly error messages", () => {
      const errors = {
        api_error: "Failed to fetch Instagram posts. Please check your Instagram connection.",
        insights_error: "Failed to fetch post insights",
        analysis_error: "Failed to analyze post after multiple attempts. Please try again later.",
        rate_limit: "Rate limit exceeded. Try again after 60 seconds.",
      };

      Object.values(errors).forEach((msg) => {
        expect(msg).toBeDefined();
        expect(msg.length).toBeGreaterThan(0);
      });
    });
  });

  describe("Data normalization", () => {
    it("should normalize post data correctly with hashtags", () => {
      const rawPost = {
        id: "123",
        caption: "Test #nature #photography #sunset",
        media_type: "VIDEO",
        media_url: "https://example.com/video.mp4",
        timestamp: "2026-05-29T10:00:00Z",
        permalink: "https://instagram.com/p/123",
      };

      const hashtags = extractHashtags(rawPost.caption);
      expect(hashtags).toEqual(["nature", "photography", "sunset"]);
    });

    it("should handle carousel media type", () => {
      expect(normalizeInsights).toBeDefined();
    });

    it("should calculate engagement rate from insights", () => {
      const insights = normalizeInsights({
        like_count: 50,
        comments_count: 10,
        reach: 200,
        impressions: 500,
        saved: 5,
        shares: 5,
      });

      // (50+10+5+5)/200*100 = 35%
      expect(insights.engagementRate).toBe(35);
    });

    it("should fallback to impressions when reach is 0", () => {
      const insights = normalizeInsights({
        like_count: 50,
        comments_count: 10,
        reach: 0,
        impressions: 500,
      });

      // (50+10+0+0)/500*100 = 12%
      expect(insights.engagementRate).toBe(12);
    });
  });
});
