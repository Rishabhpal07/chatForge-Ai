/**
 * Drizzle schema — the single source of truth for the database (see ADR-001).
 *
 * The `pgvector` extension, the `chunks.embedding` vector column's HNSW index, and
 * all Row Level Security policies are created in the raw SQL migration
 * (`migrations/0001_init.sql`) because Drizzle does not generate them. Keep this
 * file and that migration in lockstep.
 */
import {
  pgTable,
  uuid,
  text,
  integer,
  bigint,
  boolean,
  timestamp,
  jsonb,
  vector,
  doublePrecision,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
};

// Local fastembed model (BAAI/bge-small-en-v1.5) is 384-dim; see migration 0004.
export const EMBEDDING_DIM = 384;

/** Tenants = Clerk Organizations. */
export const tenants = pgTable("tenants", {
  id: uuid("id").primaryKey().defaultRandom(),
  clerkOrgId: text("clerk_org_id").notNull().unique(),
  name: text("name").notNull(),
  plan: text("plan").notNull().default("free"),
  status: text("status").notNull().default("active"),
  ...timestamps,
});

/** Mirror of Clerk users, for joins/analytics. */
export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  clerkUserId: text("clerk_user_id").notNull().unique(),
  email: text("email").notNull(),
  ...timestamps,
});

export const bots = pgTable(
  "bots",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull(),
    name: text("name").notNull(),
    publicKey: text("public_key").notNull(),
    systemPrompt: text("system_prompt").notNull().default(""),
    model: text("model").notNull().default("openai/gpt-oss-20b:free"),
    temperature: doublePrecision("temperature").notNull().default(0.2),
    theme: jsonb("theme").notNull().default({}),
    allowedDomains: text("allowed_domains").array().notNull().default(sql`'{}'`),
    status: text("status").notNull().default("draft"),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("bots_public_key_idx").on(t.publicKey),
    index("bots_tenant_idx").on(t.tenantId),
  ],
);

export const sources = pgTable(
  "sources",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull(),
    botId: uuid("bot_id").notNull(),
    type: text("type").notNull(),
    uri: text("uri").notNull(),
    storageKey: text("storage_key"),
    status: text("status").notNull().default("pending"),
    error: text("error"),
    bytes: bigint("bytes", { mode: "number" }),
    checksum: text("checksum"),
    crawlMode: text("crawl_mode").notNull().default("standard"),
    totalPages: integer("total_pages").notNull().default(0),
    processedPages: integer("processed_pages").notNull().default(0),
    indexedPages: integer("indexed_pages").notNull().default(0),
    ...timestamps,
  },
  (t) => [
    index("sources_tenant_idx").on(t.tenantId),
    index("sources_bot_idx").on(t.botId),
    index("sources_status_idx").on(t.status),
  ],
);

export const documents = pgTable(
  "documents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull(),
    sourceId: uuid("source_id").notNull(),
    title: text("title").notNull().default(""),
    metadata: jsonb("metadata").notNull().default({}),
    ...timestamps,
  },
  (t) => [
    index("documents_tenant_idx").on(t.tenantId),
    index("documents_source_idx").on(t.sourceId),
  ],
);

export const chunks = pgTable(
  "chunks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull(),
    botId: uuid("bot_id").notNull(),
    documentId: uuid("document_id").notNull(),
    ordinal: integer("ordinal").notNull(),
    content: text("content").notNull(),
    tokenCount: integer("token_count").notNull().default(0),
    embedding: vector("embedding", { dimensions: EMBEDDING_DIM }),
    metadata: jsonb("metadata").notNull().default({}),
    ...timestamps,
  },
  (t) => [
    index("chunks_tenant_idx").on(t.tenantId),
    index("chunks_bot_idx").on(t.botId),
    index("chunks_document_idx").on(t.documentId),
    // HNSW index is created in the raw SQL migration (vector_cosine_ops).
  ],
);

export const conversations = pgTable(
  "conversations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull(),
    botId: uuid("bot_id").notNull(),
    visitorId: text("visitor_id").notNull(),
    channel: text("channel").notNull().default("widget"),
    startedAt: timestamp("started_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    ...timestamps,
  },
  (t) => [
    index("conversations_tenant_idx").on(t.tenantId),
    index("conversations_bot_idx").on(t.botId),
  ],
);

export const messages = pgTable(
  "messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull(),
    conversationId: uuid("conversation_id").notNull(),
    role: text("role").notNull(),
    content: text("content").notNull(),
    citations: jsonb("citations").notNull().default([]),
    tokensIn: integer("tokens_in").notNull().default(0),
    tokensOut: integer("tokens_out").notNull().default(0),
    model: text("model"),
    costUsd: doublePrecision("cost_usd").notNull().default(0),
    ...timestamps,
  },
  (t) => [
    index("messages_tenant_idx").on(t.tenantId),
    index("messages_conversation_idx").on(t.conversationId),
  ],
);

export const usageEvents = pgTable(
  "usage_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull(),
    botId: uuid("bot_id"),
    kind: text("kind").notNull(), // embed | chat | ingest
    units: integer("units").notNull().default(0),
    costUsd: doublePrecision("cost_usd").notNull().default(0),
    period: text("period").notNull(), // YYYY-MM
    ...timestamps,
  },
  (t) => [
    index("usage_events_tenant_idx").on(t.tenantId),
    index("usage_events_period_idx").on(t.tenantId, t.period),
  ],
);

export const subscriptions = pgTable(
  "subscriptions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull(),
    razorpaySubId: text("razorpay_sub_id"),
    plan: text("plan").notNull().default("free"),
    status: text("status").notNull().default("active"),
    currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }),
    limits: jsonb("limits").notNull().default({}),
    ...timestamps,
  },
  (t) => [uniqueIndex("subscriptions_tenant_idx").on(t.tenantId)],
);

export const apiKeys = pgTable(
  "api_keys",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull(),
    name: text("name").notNull(),
    hashedKey: text("hashed_key").notNull(),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    scopes: text("scopes").array().notNull().default(sql`'{}'`),
    revoked: boolean("revoked").notNull().default(false),
    ...timestamps,
  },
  (t) => [
    index("api_keys_tenant_idx").on(t.tenantId),
    uniqueIndex("api_keys_hashed_idx").on(t.hashedKey),
  ],
);

export const auditLogs = pgTable(
  "audit_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull(),
    actor: text("actor").notNull(),
    action: text("action").notNull(),
    target: text("target"),
    meta: jsonb("meta").notNull().default({}),
    ...timestamps,
  },
  (t) => [index("audit_logs_tenant_idx").on(t.tenantId)],
);
