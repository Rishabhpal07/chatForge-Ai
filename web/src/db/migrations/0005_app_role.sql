-- 0005 — least-privilege application role so RLS is actually enforced.
--
-- Until now the app connected as the superuser `chatforge`, and superusers BYPASS
-- row-level security — so tenant isolation policies never took effect. This creates a
-- dedicated, non-superuser role for all runtime (data-plane + control-plane) traffic.
-- Migrations keep running as the owner/superuser (via MIGRATION_DATABASE_URL); only the
-- app's connection switches to this role.
--
-- The role owns nothing, is NOSUPERUSER and NOBYPASSRLS, so every tenant table's
-- `tenant_isolation` policy applies to it. It can only see rows whose tenant_id matches
-- the transaction-local `app.tenant_id` GUC set by withTenant()/tenant_tx().

-- This role is only needed where the app would otherwise connect as a SUPERUSER (local
-- Docker Postgres), because superusers bypass RLS. On managed Postgres (Neon/Supabase)
-- the connection role is already a non-superuser with RLS enforced, so this is not needed
-- there — and ALTER ROLE / GRANT-ON-DATABASE would fail for a non-superuser anyway.
-- So we run the whole setup ONLY when the migrating role is a superuser, and no-op
-- otherwise. Guarded GRANTs run via EXECUTE so the block stays valid on every host.
DO $$
BEGIN
  IF (SELECT rolsuper FROM pg_roles WHERE rolname = current_user) THEN
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'chatforge_app') THEN
      CREATE ROLE chatforge_app LOGIN PASSWORD 'chatforge_app';
    END IF;
    -- Defensive: never let it bypass RLS.
    ALTER ROLE chatforge_app NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;

    EXECUTE format('GRANT CONNECT ON DATABASE %I TO chatforge_app', current_database());
    GRANT USAGE ON SCHEMA public TO chatforge_app;
    -- DML on all existing tables + sequences. (No DDL, no TRUNCATE.)
    GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO chatforge_app;
    GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO chatforge_app;
  END IF;
END $$;

-- CONVENTION: any future migration that CREATEs a table must re-run the two GRANTs above
-- (or grant on the specific table) so the app role can use it. We intentionally do NOT use
-- ALTER DEFAULT PRIVILEGES here: it writes to the pg_default_acl catalog, and extending
-- that file via posix_fallocate dead-locks on Docker Desktop's macOS bind-mount file
-- sharing. The explicit GRANT-on-all-tables approach avoids that and is equally correct.

-- resolve_bot() is SECURITY DEFINER + already GRANT EXECUTE TO PUBLIC, so the role can
-- call it (it runs as the owner and bypasses RLS to expose one active bot by public_key).
