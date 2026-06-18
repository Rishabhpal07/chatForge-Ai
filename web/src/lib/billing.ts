import { eq } from "drizzle-orm";
import { PLAN_LIMITS, type Plan } from "@chatforge/shared";
import { db, withTenant } from "@/src/db/client";
import { subscriptions, tenants } from "@/src/db/schema";
import { writeAudit } from "@/src/lib/audit";

export async function activatePlan(opts: {
  tenantId: string;
  plan: Exclude<Plan, "free">;
  actor: string;
  meta?: Record<string, unknown>;
}): Promise<void> {
  const periodEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

  await withTenant(opts.tenantId, (tx) =>
    tx
      .insert(subscriptions)
      .values({
        tenantId: opts.tenantId,
        plan: opts.plan,
        status: "active",
        limits: PLAN_LIMITS[opts.plan],
        currentPeriodEnd: periodEnd,
      })
      .onConflictDoUpdate({
        target: subscriptions.tenantId,
        set: {
          plan: opts.plan,
          status: "active",
          limits: PLAN_LIMITS[opts.plan],
          currentPeriodEnd: periodEnd,
          updatedAt: new Date(),
        },
      }),
  );

  await db
    .update(tenants)
    .set({ plan: opts.plan, updatedAt: new Date() })
    .where(eq(tenants.id, opts.tenantId));

  await writeAudit({
    tenantId: opts.tenantId,
    actor: opts.actor,
    action: "subscription.activated",
    meta: { plan: opts.plan, ...(opts.meta ?? {}) },
  });
}
