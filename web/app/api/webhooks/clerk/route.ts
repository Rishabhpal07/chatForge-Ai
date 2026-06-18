import { NextRequest, NextResponse } from "next/server";
import { Webhook } from "svix";
import { eq } from "drizzle-orm";
import { db } from "@/src/db/client";
import { tenants, users } from "@/src/db/schema";
import { PLAN_LIMITS } from "@chatforge/shared";
import { subscriptions } from "@/src/db/schema";

/**
 * Clerk webhook: keeps `tenants` (orgs) and `users` mirrored. Signature-verified with
 * svix. Set CLERK_WEBHOOK_SIGNING_SECRET to the endpoint's signing secret.
 */
export async function POST(req: NextRequest): Promise<Response> {
  const secret = process.env.CLERK_WEBHOOK_SIGNING_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "webhook secret not configured" }, { status: 500 });
  }

  const payload = await req.text();
  const headers = {
    "svix-id": req.headers.get("svix-id") ?? "",
    "svix-timestamp": req.headers.get("svix-timestamp") ?? "",
    "svix-signature": req.headers.get("svix-signature") ?? "",
  };

  let evt: { type: string; data: Record<string, unknown> };
  try {
    evt = new Webhook(secret).verify(payload, headers) as typeof evt;
  } catch {
    return NextResponse.json({ error: "invalid signature" }, { status: 400 });
  }

  switch (evt.type) {
    case "organization.created":
    case "organization.updated": {
      const orgId = evt.data.id as string;
      const name = (evt.data.name as string) ?? "Workspace";
      const [t] = await db
        .insert(tenants)
        .values({ clerkOrgId: orgId, name })
        .onConflictDoUpdate({ target: tenants.clerkOrgId, set: { name, updatedAt: new Date() } })
        .returning({ id: tenants.id });
      if (t) {
        await db
          .insert(subscriptions)
          .values({ tenantId: t.id, plan: "free", status: "active", limits: PLAN_LIMITS.free })
          .onConflictDoNothing({ target: subscriptions.tenantId });
      }
      break;
    }
    case "user.created":
    case "user.updated": {
      const userId = evt.data.id as string;
      const emails = (evt.data.email_addresses as Array<{ email_address: string }>) ?? [];
      const email = emails[0]?.email_address ?? "";
      await db
        .insert(users)
        .values({ clerkUserId: userId, email })
        .onConflictDoUpdate({ target: users.clerkUserId, set: { email, updatedAt: new Date() } });
      break;
    }
    case "organization.deleted": {
      await db.delete(tenants).where(eq(tenants.clerkOrgId, evt.data.id as string));
      break;
    }
  }

  return NextResponse.json({ ok: true });
}
