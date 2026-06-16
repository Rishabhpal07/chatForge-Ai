"""Best-effort Redis fixed-window rate limiter for the public chat endpoint.

Fails OPEN if Redis is unreachable (availability over strictness for a chat widget).
"""
from __future__ import annotations

import redis.asyncio as aioredis

from app.core.config import get_settings

_redis: aioredis.Redis | None = None


def _client() -> aioredis.Redis:
    global _redis
    if _redis is None:
        _redis = aioredis.from_url(get_settings().redis_url, decode_responses=True)
    return _redis


async def allow(key: str, *, limit: int, window_seconds: int) -> bool:
    """Return True if the action is within the limit for the current window."""
    try:
        r = _client()
        count = await r.incr(key)
        if count == 1:
            await r.expire(key, window_seconds)
        return count <= limit
    except Exception:  # noqa: BLE001 — Redis down: don't block chat
        return True
