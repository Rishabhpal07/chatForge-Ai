"""Liveness and readiness probes."""
from __future__ import annotations

from fastapi import APIRouter

from app.db.session import get_pool

router = APIRouter(tags=["health"])


@router.get("/health")
async def health() -> dict[str, str]:
    """Liveness: process is up."""
    return {"status": "ok"}


@router.get("/ready")
async def ready() -> dict[str, str]:
    """Readiness: dependencies (DB) reachable."""
    try:
        pool = get_pool()
        async with pool.acquire() as conn:
            await conn.execute("SELECT 1")
    except Exception as exc:  # noqa: BLE001 — surface any dependency failure
        return {"status": "degraded", "db": str(exc)}
    return {"status": "ready", "db": "ok"}
