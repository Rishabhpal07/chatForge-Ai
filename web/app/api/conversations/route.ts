import { NextResponse } from "next/server";
import { count, desc, eq } from "drizzle-orm";
import { withTenant } from "@/src/db/client";
import { bots, conversations, messages } from "@/src/db/schema";
import { requireTenant } from "@/src/lib/auth";
import { handle } from "@/src/lib/api";

// GET /api/conversations — recent conversations with bot name + message count.
export async function GET(): Promise<Response> {
  return handle(async () => {
    const { tenantId } = await requireTenant();
    const rows = await withTenant(tenantId, (tx) =>
      tx
        .select({
          id: conversations.id,
          botName: bots.name,
          visitorId: conversations.visitorId,
          startedAt: conversations.startedAt,
          messageCount: count(messages.id),
        })
        .from(conversations)
        .innerJoin(bots, eq(bots.id, conversations.botId))
        .leftJoin(messages, eq(messages.conversationId, conversations.id))
        .groupBy(conversations.id, bots.name, conversations.visitorId, conversations.startedAt)
        .orderBy(desc(conversations.startedAt))
        .limit(50),
    );
    return NextResponse.json({ conversations: rows });
  });
}
