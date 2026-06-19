import { NextRequest, NextResponse } from "next/server";
import { and, eq, sql } from "drizzle-orm";
import { withTenant } from "@/src/db/client";
import { sources } from "@/src/db/schema";
import { requireTenant } from "@/src/lib/auth";
import { handle } from "@/src/lib/api";

type Ctx = { params: Promise<{ sourceId: string }> };

// PATCH /api/sources/:sourceId — stop an in-progress crawl, keeping whatever is already
// indexed. Setting status to `ready` is the cooperative stop signal: the worker checks the
// source status between batches and finalizes instead of fetching more pages.
export async function PATCH(_req: NextRequest, ctx: Ctx): Promise<Response> {
  return handle(async () => {
    const { tenantId } = await requireTenant();
    const { sourceId } = await ctx.params;
    const [source] = await withTenant(tenantId, (tx) =>
      tx
        .update(sources)
        .set({ status: "ready", updatedAt: new Date() })
        .where(
          and(
            eq(sources.id, sourceId),
            // Only meaningful while it's still working.
            sql`${sources.status} in ('pending','processing','partially_ready')`,
          ),
        )
        .returning(),
    );
    if (!source) return NextResponse.json({ error: "not found or already finished" }, { status: 404 });
    return NextResponse.json({ source });
  });
}

// DELETE /api/sources/:sourceId — remove a source and everything it produced (documents +
// chunks). Safe to call mid-crawl: the worker sees the row gone and stops cleanly.
export async function DELETE(_req: NextRequest, ctx: Ctx): Promise<Response> {
  return handle(async () => {
    const { tenantId } = await requireTenant();
    const { sourceId } = await ctx.params;
    const deleted = await withTenant(tenantId, async (tx) => {
      const [src] = await tx.select({ id: sources.id }).from(sources).where(eq(sources.id, sourceId)).limit(1);
      if (!src) return false;
      // Dependency order (no DB-level cascades): chunks → documents → source.
      await tx.execute(
        sql`DELETE FROM chunks WHERE document_id IN (SELECT id FROM documents WHERE source_id = ${sourceId})`,
      );
      await tx.execute(sql`DELETE FROM documents WHERE source_id = ${sourceId}`);
      await tx.delete(sources).where(eq(sources.id, sourceId));
      return true;
    });
    if (!deleted) return NextResponse.json({ error: "not found" }, { status: 404 });
    return NextResponse.json({ ok: true });
  });
}
