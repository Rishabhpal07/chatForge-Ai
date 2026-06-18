-- 0002 — public bot resolver.
-- The widget hits /chat with only a public_key; the AI service must resolve the bot
-- (and its tenant) before any tenant context exists, which RLS would otherwise block.
-- A SECURITY DEFINER function bypasses RLS but exposes only a single active bot's row
-- by public_key — nothing else. DB access is already restricted to our services.

CREATE OR REPLACE FUNCTION resolve_bot(p_public_key text)
RETURNS TABLE (
  id              uuid,
  tenant_id       uuid,
  name            text,
  system_prompt   text,
  model           text,
  temperature     double precision,
  theme           jsonb,
  allowed_domains text[],
  status          text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id, tenant_id, name, system_prompt, model, temperature, theme,
         allowed_domains, status
  FROM bots
  WHERE public_key = p_public_key AND status = 'active';
$$;

GRANT EXECUTE ON FUNCTION resolve_bot(text) TO PUBLIC;
