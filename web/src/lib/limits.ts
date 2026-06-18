/** Plan limits + current usage, for enforcement and the billing UI. */
import { and, count, eq, sql } from "drizzle-orm";
import { withTenant } from "@/src/db/client";
import { bots, sources, subscriptions, usageEvents } from "@/src/db/schema";
import { PLAN_LIMITS, type Plan, type PlanLimits } from "@chatforge/shared";

export function currentPeriod(): string {
  return new Date().toISOString().slice(0, 7); // YYYY-MM
}

export async function getPlan(tenantId: string): Promise<{ plan: Plan; limits: PlanLimits }> {
  const [sub] = await withTenant(tenantId, (tx) =>
    tx.select().from(subscriptions).where(eq(subscriptions.tenantId, tenantId)).limit(1),
  );
  const plan = (sub?.plan as Plan) ?? "free";
  const stored = sub?.limits as Partial<PlanLimits> | undefined;
  const limits = { ...PLAN_LIMITS[plan ?? "free"], ...(stored ?? {}) } as PlanLimits;
  return { plan, limits };
}

export interface Usage {
  bots: number;
  sources: number;
  monthlyMessages: number;
}

export async function getUsage(tenantId: string): Promise<Usage> {
  return withTenant(tenantId, async (tx) => {
    const [b] = await tx.select({ c: count() }).from(bots).where(eq(bots.tenantId, tenantId));
    const [s] = await tx
      .select({ c: count() })
      .from(sources)
      .where(eq(sources.tenantId, tenantId));
    const [m] = await tx
      .select({ sum: sql<number>`coalesce(sum(${usageEvents.units}), 0)` })
      .from(usageEvents)
      .where(
        and(
          eq(usageEvents.tenantId, tenantId),
          eq(usageEvents.kind, "chat"),
          eq(usageEvents.period, currentPeriod()),
        ),
      );
    return { bots: b.c, sources: s.c, monthlyMessages: Number(m.sum) };
  });
}

export class LimitError extends Error {
  constructor(
    message: string,
    public limit: number,
  ) {
    super(message);
  }
}

/** Throw LimitError if creating another bot would exceed the plan. */
export async function assertCanCreateBot(tenantId: string): Promise<void> {
  const [{ limits }, usage] = await Promise.all([getPlan(tenantId), getUsage(tenantId)]);
  if (usage.bots >= limits.maxBots) {
    throw new LimitError(
      `Bot limit reached (${limits.maxBots}). Upgrade your plan to add more.`,
      limits.maxBots,
    );
  }
}

/** Throw LimitError if adding another source would exceed the plan. */
export async function assertCanAddSource(tenantId: string): Promise<void> {
  const [{ limits }, usage] = await Promise.all([getPlan(tenantId), getUsage(tenantId)]);
  if (usage.sources >= limits.maxSources) {
    throw new LimitError(
      `Source limit reached (${limits.maxSources}). Upgrade your plan to add more.`,
      limits.maxSources,
    );
  }
}
