/**
 * Minimal forward-only migration runner. Applies every `*.sql` file in
 * `migrations/` (lexical order) that hasn't been recorded in `_migrations`.
 * Each file runs inside its own transaction.
 *
 * Run with:  npm run db:migrate   (from web/)
 */
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import postgres from "postgres";

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = join(__dirname, "migrations");

async function main() {
  // Migrations need owner/superuser privileges (CREATE ROLE/EXTENSION, ALTER TABLE),
  // so prefer the admin DSN. Runtime connections use the least-privilege DATABASE_URL.
  const connectionString =
    process.env.MIGRATION_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("MIGRATION_DATABASE_URL (or DATABASE_URL) is not set");
  }

  // max:1 so statements run on a single connection in order.
  const sql = postgres(connectionString, { max: 1 });

  await sql`
    CREATE TABLE IF NOT EXISTS _migrations (
      name        text PRIMARY KEY,
      applied_at  timestamptz NOT NULL DEFAULT now()
    )
  `;

  const applied = new Set(
    (await sql<{ name: string }[]>`SELECT name FROM _migrations`).map(
      (r) => r.name,
    ),
  );

  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  let count = 0;
  for (const file of files) {
    if (applied.has(file)) continue;
    const content = readFileSync(join(MIGRATIONS_DIR, file), "utf8");
    process.stdout.write(`▶ applying ${file} ... `);
    await sql.begin(async (tx) => {
      await tx.unsafe(content);
      await tx`INSERT INTO _migrations (name) VALUES (${file})`;
    });
    console.log("done");
    count++;
  }

  console.log(count === 0 ? "✓ up to date" : `✓ applied ${count} migration(s)`);
  await sql.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
