import { int, mysqlEnum, mysqlTable, text, timestamp, varchar, index, uniqueIndex, json } from "drizzle-orm/mysql-core";

/**
 * Core user table backing auth flow.
 * Extend this file with additional tables as your product grows.
 * Columns use camelCase to match both database fields and generated types.
 */
export const users = mysqlTable("users", {
  /**
   * Surrogate primary key. Auto-incremented numeric value managed by the database.
   * Use this for relations between tables.
   */
  id: int("id").autoincrement().primaryKey(),
  /** Manus OAuth identifier (openId) returned from the OAuth callback. Unique per user. */
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

/**
 * Cache for Instagram post analysis results.
 * Stores AI-generated descriptions and scripts for posts.
 * Enhanced with hashtags, sentiment, engagement rate, and recommendations.
 */
export const postAnalysis = mysqlTable('postAnalysis', {
  id: int('id').autoincrement().primaryKey(),
  userId: int('userId').notNull(),
  instagramPostId: varchar('instagramPostId', { length: 64 }).notNull(),
  description: text('description'),
  contentCategory: varchar('contentCategory', { length: 64 }),
  script: text('script'),
  hashtags: text('hashtags'), // JSON stringified array of hashtags
  sentiment: varchar('sentiment', { length: 32 }), // positive, negative, neutral
  engagementRate: varchar('engagementRate', { length: 16 }), // stored as string to preserve precision
  recommendations: text('recommendations'), // JSON stringified array of recommendation strings
  createdAt: timestamp('createdAt').defaultNow().notNull(),
  updatedAt: timestamp('updatedAt').defaultNow().onUpdateNow().notNull(),
}, (table) => [
  uniqueIndex('userId_postId_idx').on(table.userId, table.instagramPostId),
]);

export type PostAnalysis = typeof postAnalysis.$inferSelect;
export type InsertPostAnalysis = typeof postAnalysis.$inferInsert;

/**
 * Cache for Instagram API responses.
 * Stores raw API responses to reduce redundant API calls.
 */
export const apiCache = mysqlTable('apiCache', {
  id: int('id').autoincrement().primaryKey(),
  userId: int('userId').notNull(),
  cacheKey: varchar('cacheKey', { length: 255 }).notNull(), // composite key: e.g. "posts:limit10:cursorX"
  responseData: text('responseData').notNull(), // JSON stringified response
  expiresAt: timestamp('expiresAt').notNull(),
  createdAt: timestamp('createdAt').defaultNow().notNull(),
}, (table) => [
  uniqueIndex('userId_cacheKey_idx').on(table.userId, table.cacheKey),
  index('expiresAt_idx').on(table.expiresAt),
]);

export type ApiCache = typeof apiCache.$inferSelect;
export type InsertApiCache = typeof apiCache.$inferInsert;

/**
 * Cache for Instagram post insights.
 * Stores insights data to reduce API calls and enable trend analysis.
 */
export const postInsights = mysqlTable('postInsights', {
  id: int('id').autoincrement().primaryKey(),
  userId: int('userId').notNull(),
  instagramPostId: varchar('instagramPostId', { length: 64 }).notNull(),
  likeCount: int('likeCount').default(0).notNull(),
  commentsCount: int('commentsCount').default(0).notNull(),
  reach: int('reach').default(0).notNull(),
  impressions: int('impressions').default(0).notNull(),
  savedCount: int('savedCount').default(0),
  sharesCount: int('sharesCount').default(0),
  fetchedAt: timestamp('fetchedAt').defaultNow().notNull(),
}, (table) => [
  uniqueIndex('userId_insightsPostId_idx').on(table.userId, table.instagramPostId),
]);

export type PostInsights = typeof postInsights.$inferSelect;
export type InsertPostInsights = typeof postInsights.$inferInsert;
