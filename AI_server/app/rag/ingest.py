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


# Statuses that mean "the crawl is still running and may continue".
_ACTIVE_STATUSES = ("pending", "processing", "partially_ready")


class _Cancelled(Exception):
    """Raised internally when a source is stopped (status → ready) or deleted mid-crawl."""


# ── status / progress helpers ────────────────────────────────────────────────
async def _set_status(conn, source_id: str, status: str, error: str | None = None) -> None:
    await conn.execute(
        "UPDATE sources SET status = $2, error = $3, updated_at = now() WHERE id = $1",
        source_id, status, error,
    )


async def _still_active(conn, source_id: str) -> bool:
    """True only if the source still exists AND is in an active (running) state. A user
    'stop' sets status=ready and a 'delete' removes the row — both make this False, so the
    worker can bail between batches."""
    row = await conn.fetchrow("SELECT status FROM sources WHERE id = $1", source_id)
    return bool(row) and row["status"] in _ACTIVE_STATUSES


async def _set_progress(
    conn,
    source_id: str,
    *,
    status: str | None = None,
    total: int | None = None,
    processed: int | None = None,
    indexed: int | None = None,
    only_if_active: bool = False,
) -> None:
    """Update status + progress counters (NULL args leave the existing value). When
    `only_if_active` is set, the update is a no-op unless the source is still running —
    so a per-batch progress write can never resurrect a source the user just stopped/deleted."""
    guard = "AND status IN ('pending','processing','partially_ready')" if only_if_active else ""
    await conn.execute(
        f"""
        UPDATE sources SET
          status          = COALESCE($2, status),
          total_pages     = COALESCE($3, total_pages),
          processed_pages = COALESCE($4, processed_pages),
          indexed_pages   = COALESCE($5, indexed_pages),
          error           = NULL,
          updated_at      = now()
        WHERE id = $1 {guard}
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


async def _prepare_docs(docs: list[loaders.LoadedDoc]) -> list[tuple]:
    """Chunk + embed docs with NO database access. All chunk texts across the docs are
    embedded in ONE batch (a single ONNX/API call instead of one per doc), and this runs
    BEFORE the DB transaction opens — so slow embedding never holds a pooled connection."""
    embedder = get_embeddings_provider()
    per_doc = [(doc, chunk_text(doc.text)) for doc in docs]
    per_doc = [(doc, chunks) for doc, chunks in per_doc if chunks]
    all_texts = [c.content for _, chunks in per_doc for c in chunks]
    if not all_texts:
        return []
    vectors = await embedder.embed(all_texts)
    prepared, i = [], 0
    for doc, chunks in per_doc:
        prepared.append((doc, chunks, vectors[i : i + len(chunks)]))
        i += len(chunks)
    return prepared


async def _store_docs(conn, job: IngestJob, prepared: list[tuple]) -> tuple[int, int]:
    """Fast inserts only — embeddings were computed in _prepare_docs."""
    doc_count = chunk_count = 0
    for doc, chunks, vectors in prepared:
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
        # Whole-site crawl: try to discover the site's sitemap first → precise page count
        # + progressive indexing. Fall back to link-following deep crawl if there's none.
        if job.type == "url" and job.deep_crawl:
            sitemap = await asyncio.to_thread(crawler.discover_sitemap, job.uri)
            if sitemap:
                return await _run_sitemap(job, period, sitemap_url=sitemap)
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

    # Chunk + embed BEFORE opening the transaction (keeps DB connections free).
    prepared = await _prepare_docs(docs)

    async with tenant_tx(job.tenant_id) as conn:
        # Skip indexing if the source was stopped/deleted while fetching.
        if not await _still_active(conn, job.source_id):
            return IngestResult(source_id=job.source_id, status="ready", documents=0, chunks=0)
        doc_count, chunk_count = await _store_docs(conn, job, prepared)
        await _record_usage(conn, job, chunk_count, period)
        await _set_progress(
            conn, job.source_id, status="ready",
            total=max(len(docs), 1), processed=max(len(docs), 1), indexed=doc_count,
        )
    return IngestResult(source_id=job.source_id, status="ready", documents=doc_count, chunks=chunk_count)


async def _run_sitemap(job: IngestJob, period: str, *, sitemap_url: str | None = None) -> IngestResult:
    """Progressive sitemap ingestion: prioritize → first batch (partially_ready) → rest.
    `sitemap_url` overrides job.uri when the sitemap was auto-discovered from a page URL."""
    settings = get_settings()
    sm_url = sitemap_url or job.uri

    try:
        urls = prioritize_urls(crawler.load_sitemap_urls(sm_url))
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
        # Chunk + embed the whole batch in one go BEFORE opening the transaction —
        # a single embed call, and the pooled connection isn't held during the slow part.
        prepared = await _prepare_docs(docs)
        async with tenant_tx(job.tenant_id) as conn:
            # Bail before writing/indexing if the user stopped or deleted the source while
            # this batch was fetching (avoids inserting into a deleted source → FK error).
            if not await _still_active(conn, job.source_id):
                raise _Cancelled()
            dc, cc = await _store_docs(conn, job, prepared)
            indexed += dc
            total_chunks += cc
            processed = hi
            # Stay partially_ready until the very end → bot usable, indexing visible.
            await _set_progress(
                conn, job.source_id, status="partially_ready",
                processed=processed, indexed=indexed, only_if_active=True,
            )

    try:
        # 1) First batch → bot becomes usable immediately.
        await _process(0, first)
        # 2) Remaining pages in background batches.
        lo = first
        while lo < total:
            hi = min(lo + conc, total)
            await _process(lo, hi)
            lo = hi
    except _Cancelled:
        # User stopped (status→ready) or deleted the source. Keep whatever indexed so far;
        # if the row still exists, finalize it as ready with the partial counts.
        async with tenant_tx(job.tenant_id) as conn:
            await conn.execute(
                "UPDATE sources SET status = 'ready', processed_pages = $2, indexed_pages = $3, "
                "updated_at = now() WHERE id = $1 AND status <> 'error'",
                job.source_id, processed, indexed,
            )
            await _record_usage(conn, job, total_chunks, period)
        return IngestResult(source_id=job.source_id, status="ready", documents=indexed, chunks=total_chunks)

    # 3) Finalize.
    async with tenant_tx(job.tenant_id) as conn:
        await _record_usage(conn, job, total_chunks, period)
        await _set_progress(conn, job.source_id, status="ready", processed=total, indexed=indexed, only_if_active=True)
    return IngestResult(source_id=job.source_id, status="ready", documents=indexed, chunks=total_chunks)
