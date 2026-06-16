"""Pydantic mirrors of packages/shared (TS zod). Keep in sync — see ADR-001.

Only the contracts the AI service consumes/produces are mirrored here.
"""
from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field


# ── Ingestion (internal) ────────────────────────────────────────────────────
class IngestJob(BaseModel):
    tenant_id: str
    source_id: str
    bot_id: str
    type: Literal["pdf", "docx", "txt", "url", "sitemap"]
    uri: str
    storage_key: str | None = None
    # Web-crawl options (url sources). deep_crawl follows internal links; None values
    # fall back to the service crawl_* defaults.
    deep_crawl: bool = False
    max_pages: int | None = None
    max_depth: int | None = None


class IngestResult(BaseModel):
    source_id: str
    status: Literal["ready", "error"]
    documents: int = 0
    chunks: int = 0
    error: str | None = None


# ── Chat (public, from widget) ──────────────────────────────────────────────
class ChatRequest(BaseModel):
    public_key: str
    visitor_id: str
    conversation_id: str | None = None
    message: str = Field(min_length=1, max_length=4000)


class Citation(BaseModel):
    document_id: str
    source_uri: str
    chunk_id: str
    score: float
    snippet: str
