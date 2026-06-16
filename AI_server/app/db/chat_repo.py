"""Chat-related persistence: resolve bots, conversations, messages, usage."""
from __future__ import annotations

import datetime as dt
import json
from dataclasses import dataclass

from app.db.session import get_pool, tenant_tx


@dataclass
class ResolvedBot:
    id: str
    tenant_id: str
    name: str
    system_prompt: str
    model: str
    temperature: float
    allowed_domains: list[str]


async def resolve_bot(public_key: str) -> ResolvedBot | None:
    """Resolve a bot by its public widget key (RLS-bypassing definer function)."""
    async with get_pool().acquire() as conn:
        row = await conn.fetchrow("SELECT * FROM resolve_bot($1)", public_key)
    if row is None:
        return None
    return ResolvedBot(
        id=str(row["id"]),
        tenant_id=str(row["tenant_id"]),
        name=row["name"],
        system_prompt=row["system_prompt"],
        model=row["model"],
        temperature=float(row["temperature"]),
        allowed_domains=list(row["allowed_domains"] or []),
    )


async def ensure_conversation(
    *, tenant_id: str, bot_id: str, visitor_id: str, conversation_id: str | None
) -> str:
    async with tenant_tx(tenant_id) as conn:
        if conversation_id:
            existing = await conn.fetchval(
                "SELECT id FROM conversations WHERE id = $1", conversation_id
            )
            if existing:
                return str(existing)
        row = await conn.fetchrow(
            """INSERT INTO conversations (tenant_id, bot_id, visitor_id)
               VALUES ($1, $2, $3) RETURNING id""",
            tenant_id,
            bot_id,
            visitor_id,
        )
        return str(row["id"])


async def insert_message(
    *,
    tenant_id: str,
    conversation_id: str,
    role: str,
    content: str,
    citations: list[dict] | None = None,
    tokens_in: int = 0,
    tokens_out: int = 0,
    model: str | None = None,
) -> str:
    async with tenant_tx(tenant_id) as conn:
        row = await conn.fetchrow(
            """INSERT INTO messages
                 (tenant_id, conversation_id, role, content, citations,
                  tokens_in, tokens_out, model)
               VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7,$8)
               RETURNING id""",
            tenant_id,
            conversation_id,
            role,
            content,
            json.dumps(citations or []),
            tokens_in,
            tokens_out,
            model,
        )
        return str(row["id"])


FREE_MONTHLY_MESSAGES = 200  # fallback when no subscription row exists


async def check_message_quota(tenant_id: str) -> tuple[bool, int, int]:
    """Return (allowed, used_this_period, limit). limit < 0 means unlimited."""
    period = dt.datetime.now(dt.timezone.utc).strftime("%Y-%m")
    async with tenant_tx(tenant_id) as conn:
        limits_raw = await conn.fetchval(
            "SELECT limits FROM subscriptions WHERE tenant_id = $1", tenant_id
        )
        used = await conn.fetchval(
            "SELECT coalesce(sum(units), 0) FROM usage_events "
            "WHERE kind = 'chat' AND period = $1",
            period,
        )
    used = int(used or 0)
    limits = limits_raw if isinstance(limits_raw, dict) else (
        json.loads(limits_raw) if limits_raw else {}
    )
    limit = limits.get("maxMonthlyMessages", FREE_MONTHLY_MESSAGES)
    if limit is None or limit < 0:
        return (True, used, -1)
    return (used < limit, used, int(limit))


async def record_chat_usage(*, tenant_id: str, bot_id: str, units: int = 1) -> None:
    period = dt.datetime.now(dt.timezone.utc).strftime("%Y-%m")
    async with tenant_tx(tenant_id) as conn:
        await conn.execute(
            """INSERT INTO usage_events (tenant_id, bot_id, kind, units, period)
               VALUES ($1, $2, 'chat', $3, $4)""",
            tenant_id,
            bot_id,
            units,
            period,
        )
