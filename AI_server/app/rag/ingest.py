"""Ingestion pipeline: source -> text -> chunks -> embeddings -> pgvector.

Drives one IngestJob end to end and keeps the `sources` row status in sync. Emits a
usage_event(kind=embed). All writes happen inside a tenant-scoped (RLS) transaction.
"""
from __future__ import annotations

import datetime as dt

from app.core import storage
from app.db.session import tenant_tx
from app.db.vectors import insert_chunks, insert_document
from app.rag import crawler, loaders
from app.rag.chunker import chunk_text
from app.rag.embeddings import get_embeddings_provider
from app.schemas.contracts import IngestJob, IngestResult


async def _set_status(conn, source_id: str, status: str, error: str | None = None) -> None:
    await conn.execute(
        "UPDATE sources SET status = $2, error = $3, updated_at = now() WHERE id = $1",
        source_id,
        status,
        error,
    )


async def _load_documents(job: IngestJob) -> list[loaders.LoadedDoc]:
    if job.type in ("pdf", "docx", "txt"):
        if not job.storage_key:
            raise ValueError("file source missing storage_key")
        data = storage.download_bytes(job.storage_key)
        return loaders.load_bytes(job.type, data, title=job.uri)
    if job.type == "url":
        if job.deep_crawl:
            return await crawler.crawl_deep(
                job.uri, max_pages=job.max_pages, max_depth=job.max_depth
            )
        return await crawler.crawl_single(job.uri)
    if job.type == "sitemap":
        return await crawler.crawl_sitemap(job.uri, max_pages=job.max_pages)
    raise ValueError(f"unsupported source type: {job.type}")


async def run_ingestion(job: IngestJob) -> IngestResult:
    embedder = get_embeddings_provider()
    period = dt.datetime.now(dt.timezone.utc).strftime("%Y-%m")

    try:
        docs = await _load_documents(job)
    except Exception as exc:  # noqa: BLE001 — record load failure on the source
        async with tenant_tx(job.tenant_id) as conn:
            await _set_status(conn, job.source_id, "error", str(exc))
        return IngestResult(source_id=job.source_id, status="error", error=str(exc))

    doc_count = 0
    chunk_count = 0
    try:
        async with tenant_tx(job.tenant_id) as conn:
            await _set_status(conn, job.source_id, "processing")

            for doc in docs:
                chunks = chunk_text(doc.text)
                if not chunks:
                    continue
                vectors = await embedder.embed([c.content for c in chunks])
                document_id = await insert_document(
                    conn,
                    tenant_id=job.tenant_id,
                    source_id=job.source_id,
                    title=doc.title,
                    metadata=doc.metadata,
                )
                rows = [
                    (c.ordinal, c.content, c.token_count, vectors[i], {})
                    for i, c in enumerate(chunks)
                ]
                chunk_count += await insert_chunks(
                    conn,
                    tenant_id=job.tenant_id,
                    bot_id=job.bot_id,
                    document_id=document_id,
                    rows=rows,
                )
                doc_count += 1

            await conn.execute(
                """
                INSERT INTO usage_events (tenant_id, bot_id, kind, units, period)
                VALUES ($1, $2, 'embed', $3, $4)
                """,
                job.tenant_id,
                job.bot_id,
                chunk_count,
                period,
            )
            await _set_status(conn, job.source_id, "ready")
    except Exception as exc:  # noqa: BLE001
        async with tenant_tx(job.tenant_id) as conn:
            await _set_status(conn, job.source_id, "error", str(exc))
        return IngestResult(source_id=job.source_id, status="error", error=str(exc))

    return IngestResult(
        source_id=job.source_id, status="ready", documents=doc_count, chunks=chunk_count
    )
