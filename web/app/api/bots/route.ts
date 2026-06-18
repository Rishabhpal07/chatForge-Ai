import { NextRequest, NextResponse } from "next/server";
import { desc } from "drizzle-orm";
import { upsertBotSchema, botThemeSchema } from "@chatforge/shared";
import { withTenant } from "@/src/db/client";
import { bots } from "@/src/db/schema";
import { requireTenant } from "@/src/lib/auth";
import { handle, generatePublicKey } from "@/src/lib/api";
import { assertCanCreateBot } from "@/src/lib/limits";
import { writeAudit } from "@/src/lib/audit";

// GET /api/bots — list the tenant's bots.
export async function GET(): Promise<Response> {
  return handle(async () => {
    const { tenantId } = await requireTenant();
    const rows = await withTenant(tenantId, (tx) =>
      tx.select().from(bots).orderBy(desc(bots.createdAt)),
    );
    return NextResponse.json({ bots: rows });
  });
}

// POST /api/bots — create a bot.
export async function POST(req: NextRequest): Promise<Response> {
  return handle(async () => {
    const { tenantId, userId } = await requireTenant();
    await assertCanCreateBot(tenantId);
    const input = upsertBotSchema.parse(await req.json());
    const theme = botThemeSchema.parse(input.theme ?? {});

    const [bot] = await withTenant(tenantId, (tx) =>
      tx
        .insert(bots)
        .values({
          tenantId,
          name: input.name,
          publicKey: generatePublicKey(),
          systemPrompt: input.systemPrompt ?? "",
          temperature: input.temperature ?? 0.2,
          theme,
          allowedDomains: input.allowedDomains ?? [],
          ...(input.model ? { model: input.model } : {}),
          ...(input.status ? { status: input.status } : {}),
        })
        .returning(),
    );
    await writeAudit({
      tenantId,
      actor: userId,
      action: "bot.create",
      target: bot.id,
      meta: { name: bot.name },
    });
    return NextResponse.json({ bot }, { status: 201 });
  });
}
