/** Append an entry to the tenant's audit log. Best-effort: never blocks the action. */
import { withTenant } from "@/src/db/client";
import { auditLogs } from "@/src/db/schema";

export async function writeAudit(opts: {
  tenantId: string;
  actor: string;
  action: string;
  target?: string;
  meta?: Record<string, unknown>;
}): Promise<void> {
  try {
    await withTenant(opts.tenantId, (tx) =>
      tx.insert(auditLogs).values({
        tenantId: opts.tenantId,
        actor: opts.actor,
        action: opts.action,
        target: opts.target ?? null,
        meta: opts.meta ?? {},
      }),
    );
  } catch (err) {
    console.error("[audit] failed to write", err);
  }
}
