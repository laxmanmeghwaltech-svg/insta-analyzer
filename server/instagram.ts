/**
 * Instagram data normalization and fetching utilities
 */

export type NormalizedPost = {
  id: string;
  caption?: string;
  mediaType: "post" | "reel" | "story" | "carousel";
  mediaUrl?: string;
  timestamp?: Date;
  permalink?: string;
  rawMediaType: string;
};

export type PostInsights = {
  likeCount: number;
  commentsCount: number;
  reach: number;
  impressions: number;
};

/**
 * Normalize Instagram media type to our standard types
 */
export function normalizeMediaType(
  rawType: string
): "post" | "reel" | "story" | "carousel" {
  const type = rawType?.toUpperCase() || "";
  if (type === "VIDEO") return "reel";
  if (type === "CAROUSEL_ALBUM") return "carousel";
  if (type === "STORY") return "story";
  return "post";
}

/**
 * Normalize a raw Instagram post to our standard format
 */
export function normalizePost(rawPost: any): NormalizedPost {
  return {
    id: rawPost.id,
    caption: rawPost.caption,
    mediaType: normalizeMediaType(rawPost.media_type),
    mediaUrl: rawPost.media_url,
    timestamp: rawPost.timestamp ? new Date(rawPost.timestamp) : undefined,
    permalink: rawPost.permalink,
    rawMediaType: rawPost.media_type,
  };
}

/**
 * Normalize Instagram post insights
 */
export function normalizeInsights(rawInsights: any): PostInsights {
  return {
    likeCount: rawInsights?.like_count || 0,
    commentsCount: rawInsights?.comments_count || 0,
    reach: rawInsights?.reach || 0,
    impressions: rawInsights?.impressions || 0,
  };
}
