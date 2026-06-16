"""Shared test fixtures. Requires the local docker-compose stack (pg, redis, minio).

Set EMBEDDINGS_PROVIDER=fake before running so no external API is hit.
"""
from __future__ import annotations

import uuid

import pytest_asyncio

from app.db.session import close_pool, init_pool, tenant_tx, get_pool


@pytest_asyncio.fixture
async def pool():
    p = await init_pool()
    yield p
    await close_pool()


@pytest_asyncio.fixture
async def tenant(pool):
    """Create an isolated tenant + bot; clean everything up afterwards."""
    tenant_id = str(uuid.uuid4())
    bot_id = str(uuid.uuid4())
    public_key = f"pk_test_{uuid.uuid4().hex[:8]}"

    async with pool.acquire() as conn:
        await conn.execute(
            "INSERT INTO tenants (id, clerk_org_id, name) VALUES ($1, $2, $3)",
            tenant_id,
            f"org_{tenant_id}",
            "Test Tenant",
        )
    async with tenant_tx(tenant_id) as conn:
        await conn.execute(
            "INSERT INTO bots (id, tenant_id, name, public_key) VALUES ($1,$2,$3,$4)",
            bot_id,
            tenant_id,
            "Test Bot",
            public_key,
        )

    yield {"tenant_id": tenant_id, "bot_id": bot_id, "public_key": public_key}

    # cleanup (tenant cascade-ish: delete children then tenant)
    async with tenant_tx(tenant_id) as conn:
        await conn.execute("DELETE FROM messages WHERE tenant_id = $1", tenant_id)
        await conn.execute("DELETE FROM conversations WHERE tenant_id = $1", tenant_id)
        await conn.execute("DELETE FROM chunks WHERE tenant_id = $1", tenant_id)
        await conn.execute("DELETE FROM documents WHERE tenant_id = $1", tenant_id)
        await conn.execute("DELETE FROM sources WHERE tenant_id = $1", tenant_id)
        await conn.execute("DELETE FROM usage_events WHERE tenant_id = $1", tenant_id)
        await conn.execute("DELETE FROM bots WHERE tenant_id = $1", tenant_id)
    async with get_pool().acquire() as conn:
        await conn.execute("DELETE FROM tenants WHERE id = $1", tenant_id)
