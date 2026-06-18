import { NextRequest, NextResponse } from "next/server";
import { asc, eq } from "drizzle-orm";
import { withTenant } from "@/src/db/client";
import { messages } from "@/src/db/schema";
import { requireTenant } from "@/src/lib/auth";
import { handle } from "@/src/lib/api";

type Ctx = { params: Promise<{ id: string }> };

// GET /api/conversations/:id — messages in a conversation (oldest first).
export async function GET(_req: NextRequest, ctx: Ctx): Promise<Response> {
  return handle(async () => {
    const { tenantId } = await requireTenant();
    const { id } = await ctx.params;
    const rows = await withTenant(tenantId, (tx) =>
      tx
        .select({
          id: messages.id,
          role: messages.role,
          content: messages.content,
          citations: messages.citations,
          createdAt: messages.createdAt,
        })
        .from(messages)
        .where(eq(messages.conversationId, id))
        .orderBy(asc(messages.createdAt)),
    );
    return NextResponse.json({ messages: rows });
  });
}
