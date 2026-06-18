from __future__ import annotations

from arq import create_pool
from arq.connections import RedisSettings
from fastapi import APIRouter, Depends, HTTPException, status

from app.core.config import get_settings
from app.core.security import ServiceContext, require_service_context
from app.schemas.contracts import IngestJob

router = APIRouter(prefix="/internal", tags=["ingest"])


@router.post("/ingest", status_code=status.HTTP_202_ACCEPTED)
async def enqueue_ingest(
    job: IngestJob, ctx: ServiceContext = Depends(require_service_context)
) -> dict[str, str]:
    if ctx.tenant_id != job.tenant_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="tenant mismatch"
        )
    redis = await create_pool(RedisSettings.from_dsn(get_settings().redis_url))
    try:
        await redis.enqueue_job("ingest_source", job.model_dump())
    finally:
        await redis.close()
    return {"status": "queued", "source_id": job.source_id}
