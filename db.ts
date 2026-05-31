import { eq, and, desc, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { InsertUser, InsertPostAnalysis, InsertPostInsights, users, postAnalysis, postInsights } from "../drizzle/schema";
import { ENV } from './_core/env';

let _db: ReturnType<typeof drizzle> | null = null;

// Lazily create the drizzle instance so local tooling can run without a DB.
export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  try {
    const values: InsertUser = {
      openId: user.openId,
    };
    const updateSet: Record<string, unknown> = {};

    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = 'admin';
      updateSet.role = 'admin';
    }

    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date();
    }

    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }

    await db.insert(users).values(values).onDuplicateKeyUpdate({
      set: updateSet,
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);

  return result.length > 0 ? result[0] : undefined;
}

export async function savePostAnalysis(analysis: InsertPostAnalysis): Promise<void> {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot save post analysis: database not available");
    return;
  }

  try {
    await db.insert(postAnalysis).values(analysis).onDuplicateKeyUpdate({
      set: {
        description: analysis.description,
        contentCategory: analysis.contentCategory,
        script: analysis.script,
        hashtags: analysis.hashtags,
        sentiment: analysis.sentiment,
        engagementRate: analysis.engagementRate,
        recommendations: analysis.recommendations,
        updatedAt: new Date(),
      },
    });
  } catch (error) {
    console.error("[Database] Failed to save post analysis:", error);
    throw error;
  }
}

export async function getPostAnalysis(userId: number, instagramPostId: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get post analysis: database not available");
    return undefined;
  }

  const result = await db
    .select()
    .from(postAnalysis)
    .where(
      and(
        eq(postAnalysis.userId, userId),
        eq(postAnalysis.instagramPostId, instagramPostId)
      )
    )
    .limit(1);

  return result.length > 0 ? result[0] : undefined;
}

/**
 * Get all post analyses for a user
 */
export async function getAllPostAnalyses(userId: number, limit: number = 50) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get post analyses: database not available");
    return [];
  }

  const result = await db
    .select()
    .from(postAnalysis)
    .where(eq(postAnalysis.userId, userId))
    .orderBy(desc(postAnalysis.updatedAt))
    .limit(limit);

  return result;
}

/**
 * Delete a post analysis (for re-analysis)
 */
export async function deletePostAnalysis(userId: number, instagramPostId: string): Promise<void> {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot delete post analysis: database not available");
    return;
  }

  try {
    await db
      .delete(postAnalysis)
      .where(
        and(
          eq(postAnalysis.userId, userId),
          eq(postAnalysis.instagramPostId, instagramPostId)
        )
      );
  } catch (error) {
    console.error("[Database] Failed to delete post analysis:", error);
    throw error;
  }
}

/**
 * Save or update post insights
 */
export async function savePostInsights(insights: InsertPostInsights): Promise<void> {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot save post insights: database not available");
    return;
  }

  try {
    await db.insert(postInsights).values(insights).onDuplicateKeyUpdate({
      set: {
        likeCount: insights.likeCount,
        commentsCount: insights.commentsCount,
        reach: insights.reach,
        impressions: insights.impressions,
        savedCount: insights.savedCount,
        sharesCount: insights.sharesCount,
        fetchedAt: new Date(),
      },
    });
  } catch (error) {
    console.error("[Database] Failed to save post insights:", error);
    throw error;
  }
}

/**
 * Get cached post insights
 */
export async function getCachedPostInsights(userId: number, instagramPostId: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get post insights: database not available");
    return undefined;
  }

  const result = await db
    .select()
    .from(postInsights)
    .where(
      and(
        eq(postInsights.userId, userId),
        eq(postInsights.instagramPostId, instagramPostId)
      )
    )
    .limit(1);

  return result.length > 0 ? result[0] : undefined;
}

/**
 * Get all cached insights for a user (for analytics/trends)
 */
export async function getAllPostInsights(userId: number, limit: number = 50) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get post insights: database not available");
    return [];
  }

  const result = await db
    .select()
    .from(postInsights)
    .where(eq(postInsights.userId, userId))
    .orderBy(desc(postInsights.fetchedAt))
    .limit(limit);

  return result;
}

/**
 * Get aggregated analytics for a user's posts
 */
export async function getAggregatedAnalytics(userId: number) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get aggregated analytics: database not available");
    return null;
  }

  try {
    // Get insights aggregation
    const insightsResult = await db
      .select({
        totalLikes: sql<number>`COALESCE(SUM(${postInsights.likeCount}), 0)`,
        totalComments: sql<number>`COALESCE(SUM(${postInsights.commentsCount}), 0)`,
        totalReach: sql<number>`COALESCE(SUM(${postInsights.reach}), 0)`,
        totalImpressions: sql<number>`COALESCE(SUM(${postInsights.impressions}), 0)`,
        totalSaves: sql<number>`COALESCE(SUM(${postInsights.savedCount}), 0)`,
        totalShares: sql<number>`COALESCE(SUM(${postInsights.sharesCount}), 0)`,
        avgEngagementRate: sql<number>`COALESCE(AVG(
          CASE WHEN ${postInsights.reach} > 0
          THEN ROUND(((${postInsights.likeCount} + ${postInsights.commentsCount} + COALESCE(${postInsights.savedCount}, 0) + COALESCE(${postInsights.sharesCount}, 0)) / ${postInsights.reach}) * 100, 2)
          ELSE 0 END
        ), 0)`,
        postCount: sql<number>`COUNT(*)`,
      })
      .from(postInsights)
      .where(eq(postInsights.userId, userId));

    // Get category distribution
    const categoryResult = await db
      .select({
        category: postAnalysis.contentCategory,
        count: sql<number>`COUNT(*)`,
      })
      .from(postAnalysis)
      .where(eq(postAnalysis.userId, userId))
      .groupBy(postAnalysis.contentCategory);

    // Get sentiment distribution
    const sentimentResult = await db
      .select({
        sentiment: postAnalysis.sentiment,
        count: sql<number>`COUNT(*)`,
      })
      .from(postAnalysis)
      .where(eq(postAnalysis.userId, userId))
      .groupBy(postAnalysis.sentiment);

    // Get top hashtags
    const analyses = await getAllPostAnalyses(userId, 100);
    const hashtagCounts = new Map<string, number>();
    for (const analysis of analyses) {
      if (analysis.hashtags) {
        try {
          const tags: string[] = JSON.parse(analysis.hashtags);
          for (const tag of tags) {
            hashtagCounts.set(tag, (hashtagCounts.get(tag) || 0) + 1);
          }
        } catch {
          // Skip malformed JSON
        }
      }
    }
    const topHashtags = [...hashtagCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20)
      .map(([tag, count]) => ({ tag, count }));

    return {
      insights: insightsResult[0] || null,
      categories: categoryResult,
      sentiments: sentimentResult,
      topHashtags,
    };
  } catch (error) {
    console.error("[Database] Failed to get aggregated analytics:", error);
    return null;
  }
}
