"""arq queue worker for ingestion jobs.

The Next.js control plane enqueues `ingest` jobs onto Redis; this worker consumes
them and runs the ingestion pipeline. Job handler is filled in during M1 (task #5).

Run:  arq app.workers.ingest_worker.WorkerSettings   (from AI_server/)
"""
from __future__ import annotations

from arq.connections import RedisSettings

from app.core.config import get_settings
from app.db.session import close_pool, init_pool
from app.rag.ingest import run_ingestion
from app.schemas.contracts import IngestJob


async def ingest_source(ctx: dict, job: dict) -> dict:
    """Process one ingestion job: loaders -> chunk -> embed -> upsert pgvector."""
    result = await run_ingestion(IngestJob.model_validate(job))
    return result.model_dump()


async def startup(ctx: dict) -> None:
    await init_pool()


async def shutdown(ctx: dict) -> None:
    await close_pool()


class WorkerSettings:
    functions = [ingest_source]
    on_startup = startup
    on_shutdown = shutdown
    redis_settings = RedisSettings.from_dsn(get_settings().redis_url)
