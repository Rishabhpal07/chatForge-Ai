"""Re-enqueue ingestion for existing sources — e.g. after switching embeddings.

Existing chunks are regenerated with the current EMBEDDINGS_PROVIDER. Run inside the
worker/ai container (connects as the superuser DSN, so it sees every tenant's sources):

    docker exec chatforge-worker python -m app.reingest            # all tenants
    docker exec chatforge-worker python -m app.reingest <tenant>   # one tenant

The worker then processes the jobs, flipping each source pending -> processing -> ready.
"""
from __future__ import annotations

import asyncio
import sys

from arq import create_pool
from arq.connections import RedisSettings

from app.core.config import get_settings
from app.db.session import close_pool, get_pool, init_pool, tenant_tx


async def main() -> None:
    tenant_filter = sys.argv[1] if len(sys.argv) > 1 else None
    settings = get_settings()

    await init_pool()
    pool = get_pool()
    try:
        # The app role is subject to RLS, so `sources` is only visible per-tenant. Read
        # the tenant list from the (RLS-free) tenants table, then read each tenant's
        # sources inside a tenant-scoped transaction.
        async with pool.acquire() as conn:
            if tenant_filter:
                tenant_ids = [tenant_filter]
            else:
                tenant_ids = [
                    str(r["id"]) for r in await conn.fetch("SELECT id FROM tenants")
                ]

        rows = []
        for tid in tenant_ids:
            async with tenant_tx(tid) as conn:
                for r in await conn.fetch(
                    "SELECT tenant_id, id, bot_id, type, uri, storage_key FROM sources"
                ):
                    rows.append(r)

        redis = await create_pool(RedisSettings.from_dsn(settings.redis_url))
        try:
            for r in rows:
                await redis.enqueue_job(
                    "ingest_source",
                    {
                        "tenant_id": str(r["tenant_id"]),
                        "source_id": str(r["id"]),
                        "bot_id": str(r["bot_id"]),
                        "type": r["type"],
                        "uri": r["uri"],
                        "storage_key": r["storage_key"],
                    },
                )
        finally:
            await redis.close()
        print(f"enqueued {len(rows)} source(s) for re-ingestion")
    finally:
        await close_pool()


if __name__ == "__main__":
    asyncio.run(main())
