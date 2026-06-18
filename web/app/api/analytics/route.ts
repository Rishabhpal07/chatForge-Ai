import { NextResponse } from "next/server";
import { and, count, eq } from "drizzle-orm";
import { withTenant } from "@/src/db/client";
import { bots, conversations, messages } from "@/src/db/schema";
import { requireTenant } from "@/src/lib/auth";
import { handle } from "@/src/lib/api";
import { getPlan, getUsage } from "@/src/lib/limits";

// GET /api/analytics — tenant-wide metrics for the analytics dashboard.
export async function GET(): Promise<Response> {
  return handle(async () => {
    const { tenantId } = await requireTenant();

    const data = await withTenant(tenantId, async (tx) => {
      const [b] = await tx.select({ c: count() }).from(bots).where(eq(bots.tenantId, tenantId));
      const [active] = await tx
        .select({ c: count() })
        .from(bots)
        .where(and(eq(bots.tenantId, tenantId), eq(bots.status, "active")));
      const [conv] = await tx
        .select({ c: count() })
        .from(conversations)
        .where(eq(conversations.tenantId, tenantId));
      const [msg] = await tx
        .select({ c: count() })
        .from(messages)
        .where(eq(messages.tenantId, tenantId));
      const perBot = await tx
        .select({
          botId: conversations.botId,
          name: bots.name,
          conversations: count(),
        })
        .from(conversations)
        .innerJoin(bots, eq(bots.id, conversations.botId))
        .where(eq(conversations.tenantId, tenantId))
        .groupBy(conversations.botId, bots.name);
      return {
        bots: b.c,
        activeBots: active.c,
        conversations: conv.c,
        messages: msg.c,
        perBot,
      };
    });

    const [{ plan, limits }, usage] = await Promise.all([
      getPlan(tenantId),
      getUsage(tenantId),
    ]);

    return NextResponse.json({ ...data, plan, limits, usage });
  });
}
