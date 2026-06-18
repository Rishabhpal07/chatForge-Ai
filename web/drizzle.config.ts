import type { Config } from "drizzle-kit";

// Used for `drizzle-kit studio` / `generate`. Migrations themselves are applied by
// src/db/migrate.ts (which also handles the raw extension + RLS SQL). See ADR-001.
export default {
  schema: "./src/db/schema.ts",
  out: "./src/db/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "",
  },
} satisfies Config;
