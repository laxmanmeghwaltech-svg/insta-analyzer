import { describe, it, expect } from "vitest";
import { normalizeMediaType, normalizePost, normalizeInsights } from "./instagram";

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
        caption: "Test caption",
        media_type: "IMAGE",
        media_url: "https://example.com/image.jpg",
        timestamp: "2026-05-29T10:00:00Z",
        permalink: "https://instagram.com/p/123",
      };

      const normalized = normalizePost(rawPost);

      expect(normalized).toEqual({
        id: "123",
        caption: "Test caption",
        mediaType: "post",
        mediaUrl: "https://example.com/image.jpg",
        timestamp: expect.any(Date),
        permalink: "https://instagram.com/p/123",
        rawMediaType: "IMAGE",
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
    });
  });

  describe("normalizeInsights", () => {
    it("should normalize raw insights data", () => {
      const rawInsights = {
        like_count: 100,
        comments_count: 25,
        reach: 500,
        impressions: 750,
      };

      const normalized = normalizeInsights(rawInsights);

      expect(normalized).toEqual({
        likeCount: 100,
        commentsCount: 25,
        reach: 500,
        impressions: 750,
      });
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
      });

      expect(normalized2).toEqual({
        likeCount: 0,
        commentsCount: 0,
        reach: 0,
        impressions: 0,
      });
    });
  });
});
