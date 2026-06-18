import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { withTenant } from "@/src/db/client";
import { sources } from "@/src/db/schema";
import { requireTenant } from "@/src/lib/auth";
import { handle } from "@/src/lib/api";
import { enqueueIngestion } from "@/src/lib/ai-service";
import type { SourceType } from "@chatforge/shared";

const ingestSchema = z.object({ sourceId: z.string().uuid() });

// POST /api/ingest — enqueue ingestion for an already-uploaded file source.
export async function POST(req: NextRequest): Promise<Response> {
  return handle(async () => {
    const { tenantId } = await requireTenant();
    const { sourceId } = ingestSchema.parse(await req.json());

    const [source] = await withTenant(tenantId, (tx) =>
      tx.select().from(sources).where(eq(sources.id, sourceId)).limit(1),
    );
    if (!source) return NextResponse.json({ error: "not found" }, { status: 404 });
    if (!source.storageKey) {
      return NextResponse.json({ error: "source has no uploaded file" }, { status: 400 });
    }

    await enqueueIngestion({
      tenantId,
      botId: source.botId,
      sourceId: source.id,
      type: source.type as SourceType,
      uri: source.uri,
      storageKey: source.storageKey,
    });
    return NextResponse.json({ status: "queued", sourceId }, { status: 202 });
  });
}
