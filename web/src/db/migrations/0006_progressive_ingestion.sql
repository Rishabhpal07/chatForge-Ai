-- 0006 — progressive sitemap ingestion: crawl mode + progress tracking.
-- `status` is plain text (no enum constraint) so the new 'partially_ready' value needs no
-- DDL. These columns drive the dashboard's live progress + "bot usable while indexing".
ALTER TABLE sources ADD COLUMN IF NOT EXISTS crawl_mode      text    NOT NULL DEFAULT 'standard';
ALTER TABLE sources ADD COLUMN IF NOT EXISTS total_pages     integer NOT NULL DEFAULT 0;
ALTER TABLE sources ADD COLUMN IF NOT EXISTS processed_pages integer NOT NULL DEFAULT 0;
ALTER TABLE sources ADD COLUMN IF NOT EXISTS indexed_pages   integer NOT NULL DEFAULT 0;
