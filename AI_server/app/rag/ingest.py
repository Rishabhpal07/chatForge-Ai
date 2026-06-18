"""Ingestion pipeline: source -> text -> chunks -> embeddings -> pgvector.

Sitemaps use PROGRESSIVE indexing: prioritize URLs, index a first batch fast and flip the
source to `partially_ready` (the bot is usable immediately), then keep indexing the rest in
batches in the background, updating progress (total/processed/indexed) as it goes. Files and
single URLs use the simple one-shot path. All writes run in tenant-scoped (RLS) transactions.
"""
from __future__ import annotations

import datetime as dt
import asyncio

from app.core import storage
from app.core.config import get_settings
from app.db.session import tenant_tx
from app.db.vectors import insert_chunks, insert_document
from app.rag import crawler, loaders
from app.rag.chunker import chunk_text
from app.rag.embeddings import get_embeddings_provider
from app.rag.url_score import prioritize_urls
from app.schemas.contracts import IngestJob, IngestResult


# ── status / progress helpers ────────────────────────────────────────────────
async def _set_status(conn, source_id: str, status: str, error: str | None = None) -> None:
    await conn.execute(
        "UPDATE sources SET status = $2, error = $3, updated_at = now() WHERE id = $1",
        source_id, status, error,
    )


async def _set_progress(
    conn,
    source_id: str,
    *,
    status: str | None = None,
    total: int | None = None,
    processed: int | None = None,
    indexed: int | None = None,
) -> None:
    """Update status + progress counters (NULL args leave the existing value)."""
    await conn.execute(
        """
        UPDATE sources SET
          status          = COALESCE($2, status),
          total_pages     = COALESCE($3, total_pages),
          processed_pages = COALESCE($4, processed_pages),
          indexed_pages   = COALESCE($5, indexed_pages),
          error           = NULL,
          updated_at      = now()
        WHERE id = $1
        """,
        source_id, status, total, processed, indexed,
    )


async def _record_usage(conn, job: IngestJob, chunk_count: int, period: str) -> None:
    if chunk_count <= 0:
        return
    await conn.execute(
        "INSERT INTO usage_events (tenant_id, bot_id, kind, units, period) VALUES ($1,$2,'embed',$3,$4)",
        job.tenant_id, job.bot_id, chunk_count, period,
    )


async def _index_docs(conn, job: IngestJob, docs: list[loaders.LoadedDoc]) -> tuple[int, int]:
    """Chunk + batch-embed + store a list of docs. Returns (doc_count, chunk_count)."""
    embedder = get_embeddings_provider()
    doc_count = chunk_count = 0
    for doc in docs:
        chunks = chunk_text(doc.text)
        if not chunks:
            continue
        vectors = await embedder.embed([c.content for c in chunks])  # batched per doc
        document_id = await insert_document(
            conn, tenant_id=job.tenant_id, source_id=job.source_id,
            title=doc.title, metadata=doc.metadata,
        )
        rows = [(c.ordinal, c.content, c.token_count, vectors[i], {}) for i, c in enumerate(chunks)]
        chunk_count += await insert_chunks(
            conn, tenant_id=job.tenant_id, bot_id=job.bot_id, document_id=document_id, rows=rows,
        )
        doc_count += 1
    return doc_count, chunk_count


# ── document loading for the one-shot path (files + single/deep URL) ─────────
async def _load_documents(job: IngestJob) -> list[loaders.LoadedDoc]:
    if job.type in ("pdf", "docx", "txt"):
        if not job.storage_key:
            raise ValueError("file source missing storage_key")
        data = storage.download_bytes(job.storage_key)
        return loaders.load_bytes(job.type, data, title=job.uri)
    if job.type == "url":
        if job.deep_crawl:
            return await crawler.crawl_deep(job.uri, max_pages=job.max_pages, max_depth=job.max_depth)
        return await crawler.crawl_single(job.uri)
    raise ValueError(f"unsupported source type for one-shot: {job.type}")


# ── entry point ──────────────────────────────────────────────────────────────
async def run_ingestion(job: IngestJob) -> IngestResult:
    period = dt.datetime.now(dt.timezone.utc).strftime("%Y-%m")
    try:
        if job.type == "sitemap":
            return await _run_sitemap(job, period)
        return await _run_single(job, period)
    except asyncio.CancelledError:
        async with tenant_tx(job.tenant_id) as conn:
            await _set_status(conn, job.source_id, "error", "ingestion cancelled or timed out")
        raise
    except Exception as exc:  # noqa: BLE001 — last-resort failure record
        async with tenant_tx(job.tenant_id) as conn:
            await _set_status(conn, job.source_id, "error", str(exc))
        return IngestResult(source_id=job.source_id, status="error", error=str(exc))


async def _run_single(job: IngestJob, period: str) -> IngestResult:
    async with tenant_tx(job.tenant_id) as conn:
        await _set_progress(conn, job.source_id, status="processing", total=1, processed=0, indexed=0)

    try:
        docs = await _load_documents(job)
    except Exception as exc:  # noqa: BLE001
        async with tenant_tx(job.tenant_id) as conn:
            await _set_status(conn, job.source_id, "error", str(exc))
        return IngestResult(source_id=job.source_id, status="error", error=str(exc))

    async with tenant_tx(job.tenant_id) as conn:
        doc_count, chunk_count = await _index_docs(conn, job, docs)
        await _record_usage(conn, job, chunk_count, period)
        await _set_progress(
            conn, job.source_id, status="ready",
            total=max(len(docs), 1), processed=max(len(docs), 1), indexed=doc_count,
        )
    return IngestResult(source_id=job.source_id, status="ready", documents=doc_count, chunks=chunk_count)


async def _run_sitemap(job: IngestJob, period: str) -> IngestResult:
    """Progressive sitemap ingestion: prioritize → first batch (partially_ready) → rest."""
    settings = get_settings()

    try:
        urls = prioritize_urls(crawler.load_sitemap_urls(job.uri))
    except Exception as exc:  # noqa: BLE001
        async with tenant_tx(job.tenant_id) as conn:
            await _set_status(conn, job.source_id, "error", f"sitemap parse failed: {exc}")
        return IngestResult(source_id=job.source_id, status="error", error=str(exc))

    cap = {
        "quick": settings.sitemap_quick_pages,
        "standard": settings.sitemap_standard_pages,
        "full": None,
    }.get(job.crawl_mode, settings.sitemap_standard_pages)
    if cap:
        urls = urls[:cap]
    total = len(urls)

    if total == 0:
        async with tenant_tx(job.tenant_id) as conn:
            await _set_status(conn, job.source_id, "error", "sitemap contained no URLs")
        return IngestResult(source_id=job.source_id, status="error", error="empty sitemap")

    async with tenant_tx(job.tenant_id) as conn:
        await _set_progress(conn, job.source_id, status="processing", total=total, processed=0, indexed=0)

    conc = settings.sitemap_concurrency
    first = min(settings.sitemap_first_batch, total)
    processed = indexed = total_chunks = 0

    async def _process(lo: int, hi: int) -> None:
        nonlocal processed, indexed, total_chunks
        docs = await crawler.crawl_urls(urls[lo:hi], concurrency=conc)
        async with tenant_tx(job.tenant_id) as conn:
            dc, cc = await _index_docs(conn, job, docs)
            indexed += dc
            total_chunks += cc
            processed = hi
            # Stay partially_ready until the very end → bot usable, indexing visible.
            await _set_progress(
                conn, job.source_id, status="partially_ready",
                processed=processed, indexed=indexed,
            )

    # 1) First batch → bot becomes usable immediately.
    await _process(0, first)
    # 2) Remaining pages in background batches.
    lo = first
    while lo < total:
        hi = min(lo + conc, total)
        await _process(lo, hi)
        lo = hi

    # 3) Finalize.
    async with tenant_tx(job.tenant_id) as conn:
        await _record_usage(conn, job, total_chunks, period)
        await _set_progress(conn, job.source_id, status="ready", processed=total, indexed=indexed)
    return IngestResult(source_id=job.source_id, status="ready", documents=indexed, chunks=total_chunks)
