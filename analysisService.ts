/**
 * AI Analysis service for Instagram posts
 * Handles LLM-based content analysis with proper validation, caching, and error recovery.
 */

import { invokeLLM } from "./_core/llm";
import { savePostAnalysis, getPostAnalysis, deletePostAnalysis } from "./db";
import {
  extractHashtags,
  sanitizeContentCategory,
  truncateCaption,
  type ContentCategory,
  type NormalizedPost,
  type PostInsights,
} from "./instagram";
import { getCached, setCached, makeCacheKey, CACHE_TTL } from "./cache";
import { TRPCError } from "@trpc/server";

export type AnalysisResult = {
  description: string;
  contentCategory: ContentCategory;
  script: string;
  hashtags: string[];
  sentiment: "positive" | "negative" | "neutral";
  recommendations: string[];
};

/**
 * Validate and sanitize an AI analysis response
 */
function validateAnalysisResponse(raw: unknown): AnalysisResult {
  if (!raw || typeof raw !== "object") {
    throw new Error("Invalid analysis response: expected an object");
  }

  const data = raw as Record<string, unknown>;

  // Validate description
  const description = typeof data.description === "string" && data.description.trim()
    ? data.description.trim()
    : "";

  if (!description) {
    throw new Error("AI analysis did not return a valid description");
  }

  // Validate and sanitize content category
  const contentCategory = sanitizeContentCategory(
    typeof data.contentCategory === "string" ? data.contentCategory : undefined
  );

  // Validate script
  const script = typeof data.script === "string" && data.script.trim()
    ? data.script.trim()
    : description; // Fallback to description if no script

  // Validate sentiment
  const rawSentiment = typeof data.sentiment === "string" ? data.sentiment.toLowerCase().trim() : "";
  const sentiment: "positive" | "negative" | "neutral" =
    rawSentiment === "positive" || rawSentiment === "negative" || rawSentiment === "neutral"
      ? rawSentiment
      : "neutral";

  // Validate recommendations
  let recommendations: string[] = [];
  if (Array.isArray(data.recommendations)) {
    recommendations = data.recommendations
      .filter((r: unknown) => typeof r === "string" && (r as string).trim())
      .map((r: string) => r.trim())
      .slice(0, 5); // Max 5 recommendations
  } else if (typeof data.recommendations === "string") {
    // Handle case where LLM returns a single string instead of array
    recommendations = [data.recommendations.trim()].filter(Boolean).slice(0, 5);
  }

  return {
    description,
    contentCategory,
    script,
    hashtags: [], // Will be populated separately from caption
    sentiment,
    recommendations,
  };
}

/**
 * Build the analysis prompt with context about the post
 */
function buildAnalysisPrompt(
  caption: string,
  mediaType: string,
  hashtags: string[],
  insights?: PostInsights
): string {
  const truncatedCaption = truncateCaption(caption, 2000);
  const hashtagStr = hashtags.length > 0 ? hashtags.map(h => `#${h}`).join(", ") : "None";
  const engagementContext = insights
    ? `\n\nEngagement data:\n- Likes: ${insights.likeCount}\n- Comments: ${insights.commentsCount}\n- Reach: ${insights.reach}\n- Engagement Rate: ${insights.engagementRate}%`
    : "";

  return `You are an expert Instagram content analyst. Analyze this ${mediaType} post and provide a comprehensive analysis.

Post Caption: "${truncatedCaption}"
Hashtags: ${hashtagStr}${engagementContext}

Provide your analysis in JSON format with these exact keys:
1. "description" - A natural language description of what the content is about (2-3 sentences, be specific about the topic and style)
2. "contentCategory" - Classify into one of: educational, promotional, entertainment, inspirational, tutorial, personal, lifestyle, behind-the-scenes, user-generated, other
3. "script" - A full content script or narration that could be used to repurpose this content (at least 3-4 sentences)
4. "sentiment" - The emotional tone: "positive", "negative", or "neutral"
5. "recommendations" - An array of 3-5 actionable recommendations for improving engagement on similar content

Important: Return ONLY valid JSON, no markdown formatting or code blocks.`;
}

/**
 * Analyze a post with AI, with caching and re-analysis support
 */
export async function analyzePost(
  userId: number,
  postId: string,
  caption: string,
  mediaType: "post" | "reel" | "story" | "carousel",
  options?: {
    forceReanalyze?: boolean;
    insights?: PostInsights;
  }
): Promise<AnalysisResult> {
  const { forceReanalyze = false, insights } = options || {};

  // Check cache unless force re-analyze
  if (!forceReanalyze) {
    const cached = await getPostAnalysis(userId, postId);
    if (cached && cached.description && cached.script) {
      // Parse cached hashtags
      let cachedHashtags: string[] = [];
      if (cached.hashtags) {
        try {
          cachedHashtags = JSON.parse(cached.hashtags);
        } catch {
          cachedHashtags = [];
        }
      }

      // Parse cached recommendations
      let cachedRecommendations: string[] = [];
      if (cached.recommendations) {
        try {
          cachedRecommendations = JSON.parse(cached.recommendations);
        } catch {
          cachedRecommendations = [];
        }
      }

      return {
        description: cached.description,
        contentCategory: (cached.contentCategory as ContentCategory) || "other",
        script: cached.script,
        hashtags: cachedHashtags,
        sentiment: (cached.sentiment as "positive" | "negative" | "neutral") || "neutral",
        recommendations: cachedRecommendations,
      };
    }
  } else {
    // Delete existing analysis for fresh start
    await deletePostAnalysis(userId, postId);
  }

  // Extract hashtags from caption
  const hashtags = extractHashtags(caption);

  // Generate AI analysis
  const prompt = buildAnalysisPrompt(caption, mediaType, hashtags, insights);

  let analysis: AnalysisResult;
  let attempts = 0;
  const maxAttempts = 2;

  while (attempts < maxAttempts) {
    try {
      const response = await invokeLLM({
        messages: [
          {
            role: "system",
            content: "You are a professional Instagram content analyst with expertise in social media strategy, engagement optimization, and content categorization. Provide insightful, accurate, and actionable analysis. Always respond with valid JSON only.",
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

      // Try to parse the response, handling potential markdown code blocks
      let parsed: unknown;
      try {
        // Strip markdown code blocks if present
        const cleanedContent = content
          .replace(/^```json?\s*\n?/i, "")
          .replace(/\n?```\s*$/i, "")
          .trim();
        parsed = JSON.parse(cleanedContent);
      } catch (parseError) {
        console.error("[Analysis] Failed to parse LLM response:", content);
        throw new Error("LLM returned invalid JSON");
      }

      // Validate and sanitize the response
      analysis = validateAnalysisResponse(parsed);
      analysis.hashtags = hashtags; // Use extracted hashtags from caption

      break; // Success, exit retry loop
    } catch (error) {
      attempts++;
      if (attempts >= maxAttempts) {
        console.error("[Analysis] All attempts failed:", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to analyze post after multiple attempts. Please try again later.",
        });
      }
      // Wait briefly before retry
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  // Calculate engagement rate string for storage
  const engagementRateStr = insights
    ? String(insights.engagementRate)
    : null;

  // Save to database
  await savePostAnalysis({
    userId,
    instagramPostId: postId,
    description: analysis!.description,
    contentCategory: analysis!.contentCategory,
    script: analysis!.script,
    hashtags: JSON.stringify(analysis!.hashtags),
    sentiment: analysis!.sentiment,
    engagementRate: engagementRateStr,
    recommendations: JSON.stringify(analysis!.recommendations),
  });

  // Also cache in memory for fast access
  const cacheKey = makeCacheKey("analysis", String(userId), postId);
  await setCached(cacheKey, analysis, CACHE_TTL.ANALYSIS);

  return analysis!;
}

/**
 * Generate a content recommendation for the user based on their overall analysis history
 */
export async function generateContentStrategy(
  userId: number,
  categoryDistribution: { category: string | null; count: number }[],
  topHashtags: { tag: string; count: number }[],
  avgEngagementRate: number
): Promise<string> {
  const categoryStr = categoryDistribution
    .map(c => `${c.category || 'uncategorized'}: ${c.count} posts`)
    .join(", ");
  const hashtagStr = topHashtags
    .slice(0, 10)
    .map(h => `#${h.tag} (${h.count} uses)`)
    .join(", ");

  const prompt = `You are a social media strategist. Based on the following Instagram account data, provide a brief content strategy recommendation (3-4 sentences):

Content categories: ${categoryStr}
Top hashtags: ${hashtagStr}
Average engagement rate: ${avgEngagementRate}%

Focus on actionable advice about content mix, posting frequency, and hashtag strategy.`;

  try {
    const response = await invokeLLM({
      messages: [
        {
          role: "system",
          content: "You are an expert Instagram content strategist. Provide concise, actionable recommendations.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
    });

    const content = response.choices[0]?.message.content;
    return typeof content === "string" ? content.trim() : "";
  } catch (error) {
    console.error("[Analysis] Failed to generate content strategy:", error);
    return "";
  }
}
