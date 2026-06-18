-- 0003 — default new bots to a free OpenRouter model so chat works without credits.
-- Paid models (e.g. anthropic/claude-haiku-4.5) return 402 without OpenRouter credits.
ALTER TABLE bots ALTER COLUMN model SET DEFAULT 'openai/gpt-oss-20b:free';

-- Migrate existing bots still on the old paid default.
UPDATE bots SET model = 'openai/gpt-oss-20b:free'
WHERE model = 'anthropic/claude-haiku-4.5';
