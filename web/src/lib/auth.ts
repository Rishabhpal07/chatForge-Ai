/**
 * Maps the Clerk session → ChatForge tenant.
 *
 * The active Clerk Organization is the tenant. On first access we provision a
 * `tenants` row (and a free `subscriptions` row) keyed by the Clerk org id. Tenant
 * provisioning uses the unscoped `db` because `tenants` is not under RLS.
 */
import { auth } from "@clerk/nextjs/server";
import { eq } from "drizzle-orm";
import { db } from "@/src/db/client";
import { tenants, subscriptions } from "@/src/db/schema";
import { PLAN_LIMITS } from "@chatforge/shared";

export class UnauthorizedError extends Error {}

export interface TenantContext {
  tenantId: string;
  userId: string;
  orgId: string;
}

async function provisionTenant(orgId: string, name: string): Promise<string> {
  const existing = await db
    .select({ id: tenants.id })
    .from(tenants)
    .where(eq(tenants.clerkOrgId, orgId))
    .limit(1);
  if (existing[0]) return existing[0].id;

  const [created] = await db
    .insert(tenants)
    .values({ clerkOrgId: orgId, name })
    .onConflictDoNothing({ target: tenants.clerkOrgId })
    .returning({ id: tenants.id });

  // onConflictDoNothing returns nothing if the row already existed (race) — re-read.
  const tenantId =
    created?.id ??
    (
      await db
        .select({ id: tenants.id })
        .from(tenants)
        .where(eq(tenants.clerkOrgId, orgId))
        .limit(1)
    )[0]!.id;

  await db
    .insert(subscriptions)
    .values({ tenantId, plan: "free", status: "active", limits: PLAN_LIMITS.free })
    .onConflictDoNothing({ target: subscriptions.tenantId });

  return tenantId;
}

/** Resolve the current tenant, provisioning on first use. Throws if not authed/org-less. */
export async function requireTenant(): Promise<TenantContext> {
  const { userId, orgId, orgSlug } = await auth();
  if (!userId) throw new UnauthorizedError("not authenticated");
  if (!orgId) throw new UnauthorizedError("no active organization");
  const tenantId = await provisionTenant(orgId, orgSlug ?? "Workspace");
  return { tenantId, userId, orgId };
}
