import { NextRequest, NextResponse } from "next/server";
import { eq, sql } from "drizzle-orm";
import { upsertBotSchema, botThemeSchema } from "@chatforge/shared";
import { withTenant } from "@/src/db/client";
import { bots } from "@/src/db/schema";
import { requireTenant } from "@/src/lib/auth";
import { handle } from "@/src/lib/api";
import { writeAudit } from "@/src/lib/audit";

type Ctx = { params: Promise<{ botId: string }> };

// GET /api/bots/:botId
export async function GET(_req: NextRequest, ctx: Ctx): Promise<Response> {
  return handle(async () => {
    const { tenantId } = await requireTenant();
    const { botId } = await ctx.params;
    const [bot] = await withTenant(tenantId, (tx) =>
      tx.select().from(bots).where(eq(bots.id, botId)).limit(1),
    );
    if (!bot) return NextResponse.json({ error: "not found" }, { status: 404 });
    return NextResponse.json({ bot });
  });
}

// PATCH /api/bots/:botId — partial update of config/theme/status.
export async function PATCH(req: NextRequest, ctx: Ctx): Promise<Response> {
  return handle(async () => {
    const { tenantId } = await requireTenant();
    const { botId } = await ctx.params;
    const input = upsertBotSchema.partial().parse(await req.json());

    const patch: Record<string, unknown> = { updatedAt: new Date() };
    if (input.name !== undefined) patch.name = input.name;
    if (input.systemPrompt !== undefined) patch.systemPrompt = input.systemPrompt;
    if (input.model !== undefined) patch.model = input.model;
    if (input.temperature !== undefined) patch.temperature = input.temperature;
    if (input.allowedDomains !== undefined) patch.allowedDomains = input.allowedDomains;
    if (input.status !== undefined) patch.status = input.status;
    if (input.theme !== undefined) patch.theme = botThemeSchema.partial().parse(input.theme);

    const [bot] = await withTenant(tenantId, (tx) =>
      tx.update(bots).set(patch).where(eq(bots.id, botId)).returning(),
    );
    if (!bot) return NextResponse.json({ error: "not found" }, { status: 404 });
    return NextResponse.json({ bot });
  });
}

// DELETE /api/bots/:botId
export async function DELETE(_req: NextRequest, ctx: Ctx): Promise<Response> {
  return handle(async () => {
    const { tenantId, userId } = await requireTenant();
    const { botId } = await ctx.params;
    // No DB-level cascades exist, so remove the bot's data in dependency order
    // (all tenant-scoped via RLS + the bot filter) to avoid orphaned rows.
    await withTenant(tenantId, async (tx) => {
      await tx.execute(sql`DELETE FROM chunks WHERE bot_id = ${botId}`);
      await tx.execute(
        sql`DELETE FROM documents WHERE source_id IN (SELECT id FROM sources WHERE bot_id = ${botId})`,
      );
      await tx.execute(
        sql`DELETE FROM messages WHERE conversation_id IN (SELECT id FROM conversations WHERE bot_id = ${botId})`,
      );
      await tx.execute(sql`DELETE FROM conversations WHERE bot_id = ${botId}`);
      await tx.execute(sql`DELETE FROM sources WHERE bot_id = ${botId}`);
      await tx.execute(sql`DELETE FROM usage_events WHERE bot_id = ${botId}`);
      await tx.delete(bots).where(eq(bots.id, botId));
    });
    await writeAudit({ tenantId, actor: userId, action: "bot.delete", target: botId });
    return NextResponse.json({ ok: true });
  });
}
