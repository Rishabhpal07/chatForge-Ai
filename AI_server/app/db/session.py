"""asyncpg pool + tenant-scoped transactions.

Mirrors the Next.js `withTenant` helper: every tenant-scoped unit of work runs in
a transaction with `app.tenant_id` set (transaction-local), so Postgres RLS isolates
rows. Schema ownership stays with Drizzle (ADR-001); this module only queries.
"""
from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

import asyncpg

from app.core.config import get_settings

_pool: asyncpg.Pool | None = None


def _normalize_dsn(dsn: str) -> str:
    # asyncpg wants the bare scheme (not SQLAlchemy-style) and doesn't understand libpq
    # query params like sslmode/channel_binding — strip them (TLS is set via the ssl kwarg).
    dsn = dsn.replace("postgresql+asyncpg://", "postgresql://")
    return dsn.split("?", 1)[0]


def _needs_ssl(dsn: str) -> bool:
    return "sslmode=require" in dsn or "neon.tech" in dsn or "upstash" in dsn


async def init_pool() -> asyncpg.Pool:
    global _pool
    if _pool is None:
        settings = get_settings()
        _pool = await asyncpg.create_pool(
            _normalize_dsn(settings.database_url),
            min_size=1,
            max_size=10,
            # Neon requires TLS; its pooled endpoint runs PgBouncer (transaction mode),
            # which is incompatible with asyncpg's prepared-statement cache → disable it.
            ssl="require" if _needs_ssl(settings.database_url) else None,
            statement_cache_size=0,
        )
    return _pool


async def close_pool() -> None:
    global _pool
    if _pool is not None:
        await _pool.close()
        _pool = None


def get_pool() -> asyncpg.Pool:
    if _pool is None:
        raise RuntimeError("DB pool not initialised; call init_pool() on startup")
    return _pool


@asynccontextmanager
async def tenant_tx(tenant_id: str) -> AsyncIterator[asyncpg.Connection]:
    """Yield a connection inside a transaction scoped to `tenant_id` via RLS."""
    pool = get_pool()
    async with pool.acquire() as conn:
        async with conn.transaction():
            # transaction-local: reset automatically at COMMIT/ROLLBACK
            await conn.execute(
                "SELECT set_config('app.tenant_id', $1, true)", tenant_id
            )
            yield conn
