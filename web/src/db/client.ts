/**
 * Database client. Two entry points:
 *
 *  - `db`               — global/unscoped (use ONLY for tenants/users bootstrap
 *                         and webhook sync, which RLS does not cover).
 *  - `withTenant(id,fn)` — runs `fn` inside a transaction with the RLS GUC
 *                         `app.tenant_id` set, so every tenant table is isolated.
 *
 * IMPORTANT: the DATABASE_URL user must be a NON-superuser (superusers bypass RLS).
 */
import { drizzle } from "drizzle-orm/postgres-js";
import { sql } from "drizzle-orm";
import postgres from "postgres";
import * as schema from "./schema";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is not set");
}

// Reuse the client across hot-reloads in dev.
const globalForDb = globalThis as unknown as { __pg?: postgres.Sql };
// prepare:false for compatibility with Neon's pooled (PgBouncer transaction-mode) endpoint.
const client = globalForDb.__pg ?? postgres(connectionString, { max: 10, prepare: false });
if (process.env.NODE_ENV !== "production") globalForDb.__pg = client;

export const db = drizzle(client, { schema });
export type DB = typeof db;
export type Tx = Parameters<Parameters<DB["transaction"]>[0]>[0];

/**
 * Run a unit of work scoped to a single tenant. All queries inside `fn` only see
 * that tenant's rows (enforced by Postgres RLS). The GUC is transaction-local
 * (`set_config(..., true)`), so it never leaks across pooled connections.
 */
export async function withTenant<T>(
  tenantId: string,
  fn: (tx: Tx) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`select set_config('app.tenant_id', ${tenantId}, true)`,
    );
    return fn(tx);
  });
}

export { schema };
