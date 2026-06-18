import { z } from "zod";

export const sourceTypeSchema = z.enum(["pdf", "docx", "txt", "url", "sitemap"]);
export type SourceType = z.infer<typeof sourceTypeSchema>;

export const sourceStatusSchema = z.enum([
  "pending",
  "processing",
  "partially_ready", // first batch indexed → bot usable while the rest continues
  "ready",
  "error",
]);
export type SourceStatus = z.infer<typeof sourceStatusSchema>;

/** Sitemap crawl scope. quick≈50 pages, standard≈500, full=all. */
export const crawlModeSchema = z.enum(["quick", "standard", "full"]);
export type CrawlMode = z.infer<typeof crawlModeSchema>;

export const sourceSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  botId: z.string().uuid(),
  type: sourceTypeSchema,
  uri: z.string(), // original filename or URL
  storageKey: z.string().nullable(),
  status: sourceStatusSchema,
  error: z.string().nullable(),
  bytes: z.number().nullable(),
  checksum: z.string().nullable(),
  crawlMode: crawlModeSchema.default("standard"),
  totalPages: z.number().default(0),
  processedPages: z.number().default(0),
  indexedPages: z.number().default(0),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Source = z.infer<typeof sourceSchema>;

/** Request a presigned upload URL for a file source. */
export const presignRequestSchema = z.object({
  botId: z.string().uuid(),
  filename: z.string().min(1),
  contentType: z.string(),
  bytes: z.number().int().positive(),
});
export type PresignRequest = z.infer<typeof presignRequestSchema>;

export const presignResponseSchema = z.object({
  uploadUrl: z.string().url(),
  storageKey: z.string(),
  sourceId: z.string().uuid(),
});
export type PresignResponse = z.infer<typeof presignResponseSchema>;

/** Register a non-file source (URL or sitemap), or confirm a finished upload. */
export const registerSourceSchema = z.object({
  botId: z.string().uuid(),
  type: sourceTypeSchema,
  uri: z.string().min(1),
  storageKey: z.string().optional(),
  // Crawl options for `url` sources. deepCrawl follows internal links; the AI service
  // clamps maxPages/maxDepth to its configured ceilings.
  deepCrawl: z.boolean().optional(),
  maxPages: z.number().int().positive().max(500).optional(),
  maxDepth: z.number().int().min(0).max(5).optional(),
  // Sitemap scope (quick/standard/full). Defaults to standard.
  crawlMode: crawlModeSchema.optional(),
});
export type RegisterSourceInput = z.infer<typeof registerSourceSchema>;
