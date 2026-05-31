import { describe, it, expect } from "vitest";
import {
  normalizeMediaType,
  normalizePost,
  normalizeInsights,
  extractHashtags,
  sanitizeContentCategory,
  truncateCaption,
  calculateBestPostingTime,
  VALID_CATEGORIES,
} from "./instagram";

describe("Instagram utilities", () => {
  describe("normalizeMediaType", () => {
    it("should convert VIDEO to reel", () => {
      expect(normalizeMediaType("VIDEO")).toBe("reel");
    });

    it("should convert CAROUSEL_ALBUM to carousel", () => {
      expect(normalizeMediaType("CAROUSEL_ALBUM")).toBe("carousel");
    });

    it("should convert STORY to story", () => {
      expect(normalizeMediaType("STORY")).toBe("story");
    });

    it("should convert IMAGE to post", () => {
      expect(normalizeMediaType("IMAGE")).toBe("post");
    });

    it("should default to post for unknown types", () => {
      expect(normalizeMediaType("UNKNOWN")).toBe("post");
    });

    it("should handle empty string", () => {
      expect(normalizeMediaType("")).toBe("post");
    });

    it("should handle case insensitivity", () => {
      expect(normalizeMediaType("video")).toBe("reel");
      expect(normalizeMediaType("Video")).toBe("reel");
    });
  });

  describe("normalizePost", () => {
    it("should normalize a raw Instagram post", () => {
      const rawPost = {
        id: "123",
        caption: "Test caption #test #hello",
        media_type: "IMAGE",
        media_url: "https://example.com/image.jpg",
        timestamp: "2026-05-29T10:00:00Z",
        permalink: "https://instagram.com/p/123",
      };

      const normalized = normalizePost(rawPost);

      expect(normalized).toEqual({
        id: "123",
        caption: "Test caption #test #hello",
        mediaType: "post",
        mediaUrl: "https://example.com/image.jpg",
        timestamp: expect.any(Date),
        permalink: "https://instagram.com/p/123",
        rawMediaType: "IMAGE",
        hashtags: ["test", "hello"],
      });
    });

    it("should handle VIDEO media type", () => {
      const rawPost = {
        id: "456",
        caption: "Video content",
        media_type: "VIDEO",
        media_url: "https://example.com/video.mp4",
      };

      const normalized = normalizePost(rawPost);

      expect(normalized.mediaType).toBe("reel");
      expect(normalized.rawMediaType).toBe("VIDEO");
    });

    it("should handle missing optional fields", () => {
      const rawPost = {
        id: "789",
        media_type: "IMAGE",
      };

      const normalized = normalizePost(rawPost);

      expect(normalized.id).toBe("789");
      expect(normalized.caption).toBeUndefined();
      expect(normalized.mediaUrl).toBeUndefined();
      expect(normalized.timestamp).toBeUndefined();
      expect(normalized.hashtags).toEqual([]);
    });
  });

  describe("normalizeInsights", () => {
    it("should normalize raw insights data", () => {
      const rawInsights = {
        like_count: 100,
        comments_count: 25,
        reach: 500,
        impressions: 750,
        saved: 10,
        shares: 5,
      };

      const normalized = normalizeInsights(rawInsights);

      expect(normalized.likeCount).toBe(100);
      expect(normalized.commentsCount).toBe(25);
      expect(normalized.reach).toBe(500);
      expect(normalized.impressions).toBe(750);
      expect(normalized.savedCount).toBe(10);
      expect(normalized.sharesCount).toBe(5);
      expect(normalized.engagementRate).toBeGreaterThan(0);
    });

    it("should calculate engagement rate correctly", () => {
      const rawInsights = {
        like_count: 80,
        comments_count: 20,
        reach: 1000,
        impressions: 2000,
      };

      const normalized = normalizeInsights(rawInsights);

      // (80 + 20 + 0 + 0) / 1000 * 100 = 10%
      expect(normalized.engagementRate).toBe(10);
    });

    it("should default to 0 for missing fields", () => {
      const rawInsights = {
        like_count: 50,
      };

      const normalized = normalizeInsights(rawInsights);

      expect(normalized).toEqual({
        likeCount: 50,
        commentsCount: 0,
        reach: 0,
        impressions: 0,
        savedCount: 0,
        sharesCount: 0,
        engagementRate: 0,
      });
    });

    it("should handle null or undefined input", () => {
      const normalized1 = normalizeInsights(null);
      const normalized2 = normalizeInsights(undefined);

      expect(normalized1).toEqual({
        likeCount: 0,
        commentsCount: 0,
        reach: 0,
        impressions: 0,
        savedCount: 0,
        sharesCount: 0,
        engagementRate: 0,
      });

      expect(normalized2).toEqual({
        likeCount: 0,
        commentsCount: 0,
        reach: 0,
        impressions: 0,
        savedCount: 0,
        sharesCount: 0,
        engagementRate: 0,
      });
    });
  });

  describe("extractHashtags", () => {
    it("should extract hashtags from caption", () => {
      expect(extractHashtags("Hello #world #test")).toEqual(["world", "test"]);
    });

    it("should handle hashtags at the beginning", () => {
      expect(extractHashtags("#start of caption")).toEqual(["start"]);
    });

    it("should handle multiple hashtags", () => {
      const result = extractHashtags("#one #two #three #four");
      expect(result).toEqual(["one", "two", "three", "four"]);
    });

    it("should convert to lowercase", () => {
      expect(extractHashtags("#UPPER #Mixed")).toEqual(["upper", "mixed"]);
    });

    it("should remove duplicates", () => {
      expect(extractHashtags("#test #test #unique")).toEqual(["test", "unique"]);
    });

    it("should handle underscores in hashtags", () => {
      expect(extractHashtags("#hello_world #foo_bar")).toEqual(["hello_world", "foo_bar"]);
    });

    it("should handle undefined caption", () => {
      expect(extractHashtags(undefined)).toEqual([]);
    });

    it("should handle empty string", () => {
      expect(extractHashtags("")).toEqual([]);
    });

    it("should not extract hashtags without #", () => {
      expect(extractHashtags("hello world")).toEqual([]);
    });
  });

  describe("sanitizeContentCategory", () => {
    it("should return valid categories as-is", () => {
      expect(sanitizeContentCategory("educational")).toBe("educational");
      expect(sanitizeContentCategory("promotional")).toBe("promotional");
      expect(sanitizeContentCategory("entertainment")).toBe("entertainment");
    });

    it("should handle case insensitivity", () => {
      expect(sanitizeContentCategory("Educational")).toBe("educational");
      expect(sanitizeContentCategory("PROMOTIONAL")).toBe("promotional");
    });

    it("should default to 'other' for unknown categories", () => {
      expect(sanitizeContentCategory("random_category")).toBe("other");
    });

    it("should handle undefined", () => {
      expect(sanitizeContentCategory(undefined)).toBe("other");
    });

    it("should handle empty string", () => {
      expect(sanitizeContentCategory("")).toBe("other");
    });

    it("should support new categories", () => {
      expect(sanitizeContentCategory("lifestyle")).toBe("lifestyle");
      expect(sanitizeContentCategory("behind-the-scenes")).toBe("behind-the-scenes");
      expect(sanitizeContentCategory("user-generated")).toBe("user-generated");
    });
  });

  describe("truncateCaption", () => {
    it("should return short captions as-is", () => {
      expect(truncateCaption("Short caption")).toBe("Short caption");
    });

    it("should truncate long captions", () => {
      const longCaption = "a".repeat(3000);
      const result = truncateCaption(longCaption, 2000);
      expect(result.length).toBeLessThan(longCaption.length);
      expect(result.endsWith("...")).toBe(true);
    });

    it("should handle undefined", () => {
      expect(truncateCaption(undefined)).toBe("");
    });

    it("should respect custom max length", () => {
      const caption = "a".repeat(100);
      expect(truncateCaption(caption, 50).length).toBe(53); // 50 + "..."
    });
  });

  describe("calculateBestPostingTime", () => {
    it("should return sorted results by avg engagement", () => {
      const posts = [
        { id: "1", mediaType: "post" as const, rawMediaType: "IMAGE", hashtags: [], timestamp: new Date("2026-01-01T09:00:00Z") },
        { id: "2", mediaType: "post" as const, rawMediaType: "IMAGE", hashtags: [], timestamp: new Date("2026-01-01T18:00:00Z") },
      ];

      const insightsMap = new Map([
        ["1", { likeCount: 100, commentsCount: 10, reach: 1000, impressions: 2000, savedCount: 0, sharesCount: 0, engagementRate: 11 }],
        ["2", { likeCount: 50, commentsCount: 5, reach: 1000, impressions: 2000, savedCount: 0, sharesCount: 0, engagementRate: 5.5 }],
      ]);

      const result = calculateBestPostingTime(posts, insightsMap);
      expect(result.length).toBeGreaterThan(0);
      // First result should have higher engagement
      expect(result[0].avgEngagement).toBeGreaterThanOrEqual(result[result.length - 1].avgEngagement);
    });

    it("should return empty array for no posts", () => {
      const result = calculateBestPostingTime([], new Map());
      expect(result).toEqual([]);
    });
  });

  describe("VALID_CATEGORIES", () => {
    it("should include all expected categories", () => {
      expect(VALID_CATEGORIES).toContain("educational");
      expect(VALID_CATEGORIES).toContain("promotional");
      expect(VALID_CATEGORIES).toContain("entertainment");
      expect(VALID_CATEGORIES).toContain("inspirational");
      expect(VALID_CATEGORIES).toContain("tutorial");
      expect(VALID_CATEGORIES).toContain("personal");
      expect(VALID_CATEGORIES).toContain("lifestyle");
      expect(VALID_CATEGORIES).toContain("behind-the-scenes");
      expect(VALID_CATEGORIES).toContain("user-generated");
      expect(VALID_CATEGORIES).toContain("other");
    });
  });
});
