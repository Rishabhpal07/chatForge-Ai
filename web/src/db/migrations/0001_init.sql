-- 0001_init — full initial schema. Authoritative for vector/RLS parts (ADR-001).
-- Mirrors web/src/db/schema.ts. Applied by scripts/migrate.ts in filename order.

CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pgcrypto;  -- gen_random_uuid()

-- ── Tenant context helper ────────────────────────────────────────────────
-- RLS policies read the current tenant from this GUC. Each request sets it with
--   SELECT set_config('app.tenant_id', '<uuid>', true)   -- transaction-local
-- The control-plane DB user is NON-superuser so RLS is actually enforced.

-- ── Tables ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tenants (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clerk_org_id  text NOT NULL UNIQUE,
  name          text NOT NULL,
  plan          text NOT NULL DEFAULT 'free',
  status        text NOT NULL DEFAULT 'active',
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS users (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clerk_user_id  text NOT NULL UNIQUE,
  email          text NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS bots (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL,
  name            text NOT NULL,
  public_key      text NOT NULL,
  system_prompt   text NOT NULL DEFAULT '',
  model           text NOT NULL DEFAULT 'anthropic/claude-haiku-4.5',
  temperature     double precision NOT NULL DEFAULT 0.2,
  theme           jsonb NOT NULL DEFAULT '{}',
  allowed_domains text[] NOT NULL DEFAULT '{}',
  status          text NOT NULL DEFAULT 'draft',
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS bots_public_key_idx ON bots (public_key);
CREATE INDEX IF NOT EXISTS bots_tenant_idx ON bots (tenant_id);

CREATE TABLE IF NOT EXISTS sources (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    uuid NOT NULL,
  bot_id       uuid NOT NULL,
  type         text NOT NULL,
  uri          text NOT NULL,
  storage_key  text,
  status       text NOT NULL DEFAULT 'pending',
  error        text,
  bytes        bigint,
  checksum     text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sources_tenant_idx ON sources (tenant_id);
CREATE INDEX IF NOT EXISTS sources_bot_idx ON sources (bot_id);
CREATE INDEX IF NOT EXISTS sources_status_idx ON sources (status);

CREATE TABLE IF NOT EXISTS documents (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL,
  source_id   uuid NOT NULL,
  title       text NOT NULL DEFAULT '',
  metadata    jsonb NOT NULL DEFAULT '{}',
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS documents_tenant_idx ON documents (tenant_id);
CREATE INDEX IF NOT EXISTS documents_source_idx ON documents (source_id);

CREATE TABLE IF NOT EXISTS chunks (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    uuid NOT NULL,
  bot_id       uuid NOT NULL,
  document_id  uuid NOT NULL,
  ordinal      integer NOT NULL,
  content      text NOT NULL,
  token_count  integer NOT NULL DEFAULT 0,
  embedding    vector(1536),
  metadata     jsonb NOT NULL DEFAULT '{}',
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS chunks_tenant_idx ON chunks (tenant_id);
CREATE INDEX IF NOT EXISTS chunks_bot_idx ON chunks (bot_id);
CREATE INDEX IF NOT EXISTS chunks_document_idx ON chunks (document_id);
-- Approximate nearest-neighbour index for cosine similarity search.
CREATE INDEX IF NOT EXISTS chunks_embedding_hnsw_idx
  ON chunks USING hnsw (embedding vector_cosine_ops);

CREATE TABLE IF NOT EXISTS conversations (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL,
  bot_id      uuid NOT NULL,
  visitor_id  text NOT NULL,
  channel     text NOT NULL DEFAULT 'widget',
  started_at  timestamptz NOT NULL DEFAULT now(),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS conversations_tenant_idx ON conversations (tenant_id);
CREATE INDEX IF NOT EXISTS conversations_bot_idx ON conversations (bot_id);

CREATE TABLE IF NOT EXISTS messages (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        uuid NOT NULL,
  conversation_id  uuid NOT NULL,
  role             text NOT NULL,
  content          text NOT NULL,
  citations        jsonb NOT NULL DEFAULT '[]',
  tokens_in        integer NOT NULL DEFAULT 0,
  tokens_out       integer NOT NULL DEFAULT 0,
  model            text,
  cost_usd         double precision NOT NULL DEFAULT 0,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS messages_tenant_idx ON messages (tenant_id);
CREATE INDEX IF NOT EXISTS messages_conversation_idx ON messages (conversation_id);

CREATE TABLE IF NOT EXISTS usage_events (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL,
  bot_id      uuid,
  kind        text NOT NULL,
  units       integer NOT NULL DEFAULT 0,
  cost_usd    double precision NOT NULL DEFAULT 0,
  period      text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS usage_events_tenant_idx ON usage_events (tenant_id);
CREATE INDEX IF NOT EXISTS usage_events_period_idx ON usage_events (tenant_id, period);

CREATE TABLE IF NOT EXISTS subscriptions (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid NOT NULL,
  razorpay_sub_id     text,
  plan                text NOT NULL DEFAULT 'free',
  status              text NOT NULL DEFAULT 'active',
  current_period_end  timestamptz,
  limits              jsonb NOT NULL DEFAULT '{}',
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS subscriptions_tenant_idx ON subscriptions (tenant_id);

CREATE TABLE IF NOT EXISTS api_keys (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL,
  name          text NOT NULL,
  hashed_key    text NOT NULL,
  last_used_at  timestamptz,
  scopes        text[] NOT NULL DEFAULT '{}',
  revoked       boolean NOT NULL DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS api_keys_tenant_idx ON api_keys (tenant_id);
CREATE UNIQUE INDEX IF NOT EXISTS api_keys_hashed_idx ON api_keys (hashed_key);

CREATE TABLE IF NOT EXISTS audit_logs (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL,
  actor       text NOT NULL,
  action      text NOT NULL,
  target      text,
  meta        jsonb NOT NULL DEFAULT '{}',
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS audit_logs_tenant_idx ON audit_logs (tenant_id);

-- ── Row Level Security ─────────────────────────────────────────────────────
-- Every tenant table is isolated by app.tenant_id. tenants/users are global
-- (control-plane code scopes them explicitly), so RLS is applied to the rest.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'bots','sources','documents','chunks','conversations','messages',
    'usage_events','subscriptions','api_keys','audit_logs'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY;', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY;', t);
    -- NULLIF(...,'') guards against the GUC being an empty string (e.g. after
    -- RESET): ''::uuid would raise, whereas NULL simply matches no rows.
    EXECUTE format($f$
      CREATE POLICY tenant_isolation ON %I
      USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
      WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
    $f$, t);
  END LOOP;
END $$;
