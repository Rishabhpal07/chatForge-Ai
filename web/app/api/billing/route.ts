import { NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { withTenant } from "@/src/db/client";
import { auditLogs } from "@/src/db/schema";
import { requireTenant } from "@/src/lib/auth";
import { handle } from "@/src/lib/api";
import { getPlan, getUsage } from "@/src/lib/limits";
import { isBillingConfigured } from "@/src/lib/razorpay";

// GET /api/billing — current plan, usage vs limits, recent audit log.
export async function GET(): Promise<Response> {
  return handle(async () => {
    const { tenantId } = await requireTenant();
    const [{ plan, limits }, usage, audit] = await Promise.all([
      getPlan(tenantId),
      getUsage(tenantId),
      withTenant(tenantId, (tx) =>
        tx
          .select()
          .from(auditLogs)
          .where(eq(auditLogs.tenantId, tenantId))
          .orderBy(desc(auditLogs.createdAt))
          .limit(10),
      ),
    ]);
    return NextResponse.json({
      plan,
      limits,
      usage,
      billingConfigured: isBillingConfigured(),
      audit,
    });
  });
}
