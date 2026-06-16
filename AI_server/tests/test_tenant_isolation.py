"""Integration test: Postgres RLS isolates tenants for the least-privilege app role.

Proves the Priority-1 security fix: connecting as `chatforge_app` (NOSUPERUSER,
NOBYPASSRLS — see migration 0005), Tenant A cannot read Tenant B's rows, and with no
`app.tenant_id` set nothing is visible at all.

Requires a running Postgres reachable via DATABASE_URL (the app-role DSN). Skips cleanly
if the DB isn't reachable so unit-test runs aren't blocked.

    docker exec chatforge-worker python -m pytest tests/test_tenant_isolation.py -q
"""
from __future__ import annotations

import os
import uuid

import asyncpg
import pytest

DSN = os.environ.get(
    "DATABASE_URL", "postgresql://chatforge_app:chatforge_app@localhost:5433/chatforge"
).replace("postgresql+asyncpg://", "postgresql://")


async def _seed_bot(conn: asyncpg.Connection, tenant_id: uuid.UUID, bot_id: uuid.UUID) -> None:
    """Insert one bot inside the tenant's RLS scope (WITH CHECK requires the GUC to match)."""
    async with conn.transaction():
        await conn.execute("SELECT set_config('app.tenant_id', $1, true)", str(tenant_id))
        await conn.execute(
            "INSERT INTO bots (id, tenant_id, name, public_key) VALUES ($1, $2, $3, $4)",
            bot_id,
            tenant_id,
            "isolation-test",
            f"pk_test_{bot_id}",
        )


async def _bot_ids_visible_to(conn: asyncpg.Connection, tenant_id: uuid.UUID) -> set[uuid.UUID]:
    async with conn.transaction():
        await conn.execute("SELECT set_config('app.tenant_id', $1, true)", str(tenant_id))
        rows = await conn.fetch("SELECT id FROM bots")
    return {r["id"] for r in rows}


@pytest.mark.asyncio
async def test_tenant_a_cannot_access_tenant_b():
    try:
        conn = await asyncpg.connect(DSN)
    except Exception as exc:  # noqa: BLE001
        pytest.skip(f"Postgres not reachable at {DSN}: {exc}")

    tenant_a, tenant_b = uuid.uuid4(), uuid.uuid4()
    bot_a, bot_b = uuid.uuid4(), uuid.uuid4()
    try:
        # The whole point: the app connection must NOT be able to bypass RLS.
        assert await conn.fetchval("SHOW is_superuser") == "off"

        # tenants has no RLS (control-plane scopes it explicitly); the app role may insert.
        await conn.execute(
            "INSERT INTO tenants (id, clerk_org_id, name) VALUES ($1,$2,$3),($4,$5,$6)",
            tenant_a, f"org_{tenant_a}", "Tenant A",
            tenant_b, f"org_{tenant_b}", "Tenant B",
        )
        await _seed_bot(conn, tenant_a, bot_a)
        await _seed_bot(conn, tenant_b, bot_b)

        # A sees only A's bot; B's row is invisible.
        visible_to_a = await _bot_ids_visible_to(conn, tenant_a)
        assert bot_a in visible_to_a
        assert bot_b not in visible_to_a

        # ...and symmetrically for B.
        visible_to_b = await _bot_ids_visible_to(conn, tenant_b)
        assert bot_b in visible_to_b
        assert bot_a not in visible_to_b

        # With no tenant context set, RLS hides everything.
        no_context = await conn.fetch(
            "SELECT id FROM bots WHERE id = ANY($1::uuid[])", [bot_a, bot_b]
        )
        assert no_context == []
    finally:
        # Clean up within each tenant's scope, then the (RLS-free) tenants rows.
        for tid in (tenant_a, tenant_b):
            try:
                async with conn.transaction():
                    await conn.execute("SELECT set_config('app.tenant_id', $1, true)", str(tid))
                    await conn.execute("DELETE FROM bots WHERE tenant_id = $1", tid)
            except Exception:  # noqa: BLE001
                pass
        await conn.execute(
            "DELETE FROM tenants WHERE id = ANY($1::uuid[])", [tenant_a, tenant_b]
        )
        await conn.close()
