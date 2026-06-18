/** Client for the FastAPI AI service. Authenticates with a signed internal token. */
import { issueServiceToken } from "./internal-token";
import type { SourceType, CrawlMode } from "@chatforge/shared";

const AI_SERVICE_URL = process.env.AI_SERVICE_URL ?? "http://localhost:8000";

export async function enqueueIngestion(input: {
  tenantId: string;
  botId: string;
  sourceId: string;
  type: SourceType;
  uri: string;
  storageKey?: string | null;
  deepCrawl?: boolean;
  maxPages?: number;
  maxDepth?: number;
  crawlMode?: CrawlMode;
}): Promise<void> {
  const token = await issueServiceToken({
    tenantId: input.tenantId,
    botId: input.botId,
    scope: "ingest",
  });
  const res = await fetch(`${AI_SERVICE_URL}/internal/ingest`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      tenant_id: input.tenantId,
      bot_id: input.botId,
      source_id: input.sourceId,
      type: input.type,
      uri: input.uri,
      storage_key: input.storageKey ?? null,
      deep_crawl: input.deepCrawl ?? false,
      max_pages: input.maxPages ?? null,
      max_depth: input.maxDepth ?? null,
      crawl_mode: input.crawlMode ?? "standard",
    }),
  });
  if (!res.ok) {
    throw new Error(`AI service ingest failed: ${res.status} ${await res.text()}`);
  }
}
