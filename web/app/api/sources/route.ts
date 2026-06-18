import { NextRequest, NextResponse } from "next/server";
import { and, desc, eq } from "drizzle-orm";
import { registerSourceSchema } from "@chatforge/shared";
import { withTenant } from "@/src/db/client";
import { sources, bots } from "@/src/db/schema";
import { requireTenant } from "@/src/lib/auth";
import { handle } from "@/src/lib/api";
import { assertCanAddSource } from "@/src/lib/limits";
import { enqueueIngestion } from "@/src/lib/ai-service";

// GET /api/sources[?botId=...] — list sources (a bot's, or all the tenant's), with bot name.
export async function GET(req: NextRequest): Promise<Response> {
  return handle(async () => {
    const { tenantId } = await requireTenant();
    const botId = req.nextUrl.searchParams.get("botId");
    const rows = await withTenant(tenantId, (tx) =>
      tx
        .select({
          id: sources.id,
          botId: sources.botId,
          botName: bots.name,
          type: sources.type,
          uri: sources.uri,
          status: sources.status,
          error: sources.error,
          bytes: sources.bytes,
          crawlMode: sources.crawlMode,
          totalPages: sources.totalPages,
          processedPages: sources.processedPages,
          indexedPages: sources.indexedPages,
          createdAt: sources.createdAt,
          updatedAt: sources.updatedAt,
        })
        .from(sources)
        .innerJoin(bots, eq(bots.id, sources.botId))
        .where(
          botId
            ? and(eq(sources.tenantId, tenantId), eq(sources.botId, botId))
            : eq(sources.tenantId, tenantId),
        )
        .orderBy(desc(sources.createdAt)),
    );
    // Derive progress_percentage for the dashboard.
    const withProgress = rows.map((r) => ({
      ...r,
      progressPercentage:
        r.totalPages > 0 ? Math.round((r.processedPages / r.totalPages) * 100) : 0,
    }));
    return NextResponse.json({ sources: withProgress });
  });
}

// POST /api/sources — register a URL/sitemap source and enqueue ingestion immediately.
export async function POST(req: NextRequest): Promise<Response> {
  return handle(async () => {
    const { tenantId } = await requireTenant();
    await assertCanAddSource(tenantId);
    const input = registerSourceSchema.parse(await req.json());
    if (input.type !== "url" && input.type !== "sitemap") {
      return NextResponse.json(
        { error: "use /api/sources/presign for file uploads" },
        { status: 400 },
      );
    }

    const [source] = await withTenant(tenantId, (tx) =>
      tx
        .insert(sources)
        .values({
          tenantId,
          botId: input.botId,
          type: input.type,
          uri: input.uri,
          status: "pending",
          crawlMode: input.crawlMode ?? "standard",
        })
        .returning(),
    );

    await enqueueIngestion({
      tenantId,
      botId: input.botId,
      sourceId: source.id,
      type: input.type,
      uri: input.uri,
      deepCrawl: input.deepCrawl,
      maxPages: input.maxPages,
      maxDepth: input.maxDepth,
      crawlMode: input.crawlMode,
    });
    return NextResponse.json({ source }, { status: 202 });
  });
}
