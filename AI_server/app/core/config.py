"""Runtime configuration, loaded from environment / root .env."""
from __future__ import annotations

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=(".env", "../.env"), env_file_encoding="utf-8", extra="ignore"
    )

    # Postgres (shared with the Next.js control plane). Runtime uses the least-privilege
    # app role so RLS is enforced; see migration 0005_app_role.sql.
    database_url: str = "postgresql://chatforge_app:chatforge_app@localhost:5433/chatforge"

    # Redis (arq queue + rate limiting).
    redis_url: str = "redis://localhost:6379"

    # S3-compatible object storage.
    s3_endpoint: str = "http://localhost:9000"
    s3_region: str = "us-east-1"
    s3_access_key_id: str = "chatforge"
    s3_secret_access_key: str = "chatforge-secret"
    s3_bucket: str = "chatforge-uploads"
    s3_force_path_style: bool = True

    # Shared secret with Next.js for internal service tokens (HS256).
    internal_jwt_secret: str = "dev-internal-secret-change-me-0123456789"

    # OpenRouter (chat / generation).
    openrouter_api_key: str = ""
    openrouter_base_url: str = "https://openrouter.ai/api/v1"
    openrouter_default_model: str = "anthropic/claude-haiku-4.5"

    # Embeddings (pluggable provider).
    embeddings_provider: str = "openai"
    embeddings_model: str = "text-embedding-3-small"
    embeddings_dim: int = 1536
    openai_api_key: str = ""

    # Retrieval defaults.
    retrieval_top_k: int = 8

    # Web crawling (url / sitemap sources).
    # When the browser engine (crawl4ai/Playwright) is enabled we get JS rendering and
    # clean markdown; if it's unavailable we fall back to httpx + trafilatura.
    crawl_browser_enabled: bool = True
    crawl_max_pages: int = 40      # hard ceiling on pages per source (sitemap / deep crawl)
    crawl_max_depth: int = 2       # default link-following depth for deep crawl
    crawl_page_timeout_ms: int = 60000
    # Pause (seconds) after page load before capturing HTML, so JS-rendered content
    # (e.g. e-commerce prices/specs on SPA/Next.js sites) is present in the markdown.
    crawl_render_delay_sec: float = 5.0

    # Progressive sitemap ingestion.
    sitemap_concurrency: int = 30      # pages fetched in parallel (env: SITEMAP_CONCURRENCY)
    sitemap_first_batch: int = 20      # index this many pages, then mark the bot usable
    sitemap_quick_pages: int = 50      # crawl_mode=quick cap
    sitemap_standard_pages: int = 500  # crawl_mode=standard cap (full = no cap)
    crawl_fetch_retries: int = 2       # per-page fetch retries on failure


@lru_cache
def get_settings() -> Settings:
    return Settings()
