import { NextRequest, NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { botThemeSchema } from "@chatforge/shared";
import { db } from "@/src/db/client";

/**
 * Public bot config for the embeddable widget. No auth: keyed by the public_key.
 * Returns ONLY non-secret fields (never the system prompt). CORS-open so the widget
 * can fetch it from any embedding site; per-bot Origin enforcement happens at /chat.
 */
type Ctx = { params: Promise<{ publicKey: string }> };

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

export async function OPTIONS(): Promise<Response> {
  return new NextResponse(null, { status: 204, headers: CORS });
}

export async function GET(_req: NextRequest, ctx: Ctx): Promise<Response> {
  const { publicKey } = await ctx.params;

  // resolve_bot() is a SECURITY DEFINER fn returning one active bot's row.
  const rows = await db.execute(
    sql`SELECT name, theme FROM resolve_bot(${publicKey})`,
  );
  const row = (rows as unknown as Array<{ name: string; theme: unknown }>)[0];
  if (!row) {
    return NextResponse.json({ error: "not found" }, { status: 404, headers: CORS });
  }

  const theme = botThemeSchema.parse(row.theme ?? {});
  const chatUrl =
    process.env.NEXT_PUBLIC_AI_SERVICE_URL ??
    process.env.AI_SERVICE_URL ??
    "http://localhost:8000";
  return NextResponse.json(
    { publicKey, name: row.name, theme, chatUrl },
    { headers: CORS },
  );
}
