/**
 * Instagram data normalization and fetching utilities
 * Enhanced with hashtag extraction, sentiment analysis helpers,
 * and engagement rate calculations.
 */

export type NormalizedPost = {
  id: string;
  caption?: string;
  mediaType: "post" | "reel" | "story" | "carousel";
  mediaUrl?: string;
  timestamp?: Date;
  permalink?: string;
  rawMediaType: string;
  hashtags: string[];
};

export type PostInsights = {
  likeCount: number;
  commentsCount: number;
  reach: number;
  impressions: number;
  savedCount: number;
  sharesCount: number;
  engagementRate: number;
};

export type ContentCategory =
  | "educational"
  | "promotional"
  | "entertainment"
  | "inspirational"
  | "tutorial"
  | "personal"
  | "lifestyle"
  | "behind-the-scenes"
  | "user-generated"
  | "other";

export const VALID_CATEGORIES: ContentCategory[] = [
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

/**
 * Extract hashtags from an Instagram caption
 */
export function extractHashtags(caption: string | undefined): string[] {
  if (!caption) return [];

  const hashtagRegex = /#(\w[\w]*)/g;
  const matches: string[] = [];
  let match: RegExpExecArray | null;

  while ((match = hashtagRegex.exec(caption)) !== null) {
    matches.push(match[1].toLowerCase());
  }

  // Remove duplicates while preserving order
  return [...new Set(matches)];
}

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
  const caption = rawPost.caption;
  return {
    id: rawPost.id,
    caption,
    mediaType: normalizeMediaType(rawPost.media_type),
    mediaUrl: rawPost.media_url,
    timestamp: rawPost.timestamp ? new Date(rawPost.timestamp) : undefined,
    permalink: rawPost.permalink,
    rawMediaType: rawPost.media_type,
    hashtags: extractHashtags(caption),
  };
}

/**
 * Normalize Instagram post insights with engagement rate calculation
 */
export function normalizeInsights(rawInsights: any): PostInsights {
  const likeCount = rawInsights?.like_count || 0;
  const commentsCount = rawInsights?.comments_count || 0;
  const reach = rawInsights?.reach || 0;
  const impressions = rawInsights?.impressions || 0;
  const savedCount = rawInsights?.saved || 0;
  const sharesCount = rawInsights?.shares || 0;

  // Calculate engagement rate: (likes + comments + saves + shares) / reach * 100
  // If reach is 0, fall back to impressions
  const totalEngagement = likeCount + commentsCount + savedCount + sharesCount;
  const audienceSize = reach > 0 ? reach : impressions;
  const engagementRate = audienceSize > 0
    ? Math.round((totalEngagement / audienceSize) * 10000) / 100 // Round to 2 decimal places
    : 0;

  return {
    likeCount,
    commentsCount,
    reach,
    impressions,
    savedCount,
    sharesCount,
    engagementRate,
  };
}

/**
 * Calculate the best posting time based on post engagement data
 */
export function calculateBestPostingTime(
  posts: NormalizedPost[],
  insightsMap: Map<string, PostInsights>
): { hour: number; dayOfWeek: number; avgEngagement: number }[] {
  const hourEngagement = new Map<number, { total: number; count: number }>();
  const dayEngagement = new Map<number, { total: number; count: number }>();

  for (const post of posts) {
    if (!post.timestamp) continue;
    const insights = insightsMap.get(post.id);
    if (!insights) continue;

    const hour = post.timestamp.getHours();
    const dayOfWeek = post.timestamp.getDay();

    const hourData = hourEngagement.get(hour) || { total: 0, count: 0 };
    hourData.total += insights.engagementRate;
    hourData.count += 1;
    hourEngagement.set(hour, hourData);

    const dayData = dayEngagement.get(dayOfWeek) || { total: 0, count: 0 };
    dayData.total += insights.engagementRate;
    dayData.count += 1;
    dayEngagement.set(dayOfWeek, dayData);
  }

  // Combine hour + day analysis
  const results: { hour: number; dayOfWeek: number; avgEngagement: number }[] = [];
  for (const [hour, hData] of hourEngagement) {
    for (const [dayOfWeek, dData] of dayEngagement) {
      const avgEngagement = (hData.total / hData.count + dData.total / dData.count) / 2;
      results.push({ hour, dayOfWeek, avgEngagement: Math.round(avgEngagement * 100) / 100 });
    }
  }

  return results.sort((a, b) => b.avgEngagement - a.avgEngagement);
}

/**
 * Validate and sanitize a content category from AI response
 */
export function sanitizeContentCategory(raw: string | undefined): ContentCategory {
  if (!raw) return "other";

  const normalized = raw.toLowerCase().trim().replace(/[^a-z-]/g, "-");

  // Direct match
  if (VALID_CATEGORIES.includes(normalized as ContentCategory)) {
    return normalized as ContentCategory;
  }

  // Fuzzy match - check if any valid category is contained in the response
  for (const cat of VALID_CATEGORIES) {
    if (normalized.includes(cat) || cat.includes(normalized)) {
      return cat;
    }
  }

  return "other";
}

/**
 * Truncate caption to a safe length for LLM prompts
 */
export function truncateCaption(caption: string | undefined, maxLength: number = 2000): string {
  if (!caption) return "";
  if (caption.length <= maxLength) return caption;
  return caption.slice(0, maxLength) + "...";
}
