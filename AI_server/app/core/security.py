"""Internal service-token verification.

The Next.js control plane signs short-lived HS256 tokens that authorise the AI
service to act for a specific tenant/bot. The AI service NEVER derives tenant_id
from client-supplied input on internal endpoints — only from a verified token.
"""
from __future__ import annotations

import time
from dataclasses import dataclass

import jwt
from fastapi import Header, HTTPException, status

from app.core.config import get_settings


@dataclass
class ServiceContext:
    tenant_id: str
    bot_id: str | None
    scope: str


def issue_service_token(
    tenant_id: str, bot_id: str | None, scope: str, ttl_seconds: int = 300
) -> str:
    """Mirror of the Next.js signer — used in tests and worker enqueue paths."""
    settings = get_settings()
    now = int(time.time())
    payload = {
        "tenant_id": tenant_id,
        "bot_id": bot_id,
        "scope": scope,
        "iat": now,
        "exp": now + ttl_seconds,
    }
    return jwt.encode(payload, settings.internal_jwt_secret, algorithm="HS256")


def verify_service_token(token: str) -> ServiceContext:
    settings = get_settings()
    try:
        payload = jwt.decode(token, settings.internal_jwt_secret, algorithms=["HS256"])
    except jwt.PyJWTError as exc:  # expired, bad signature, malformed
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"invalid service token: {exc}",
        ) from exc
    if "tenant_id" not in payload:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="missing tenant")
    return ServiceContext(
        tenant_id=payload["tenant_id"],
        bot_id=payload.get("bot_id"),
        scope=payload.get("scope", ""),
    )


async def require_service_context(
    authorization: str | None = Header(default=None),
) -> ServiceContext:
    """FastAPI dependency for internal endpoints. Expects `Authorization: Bearer <jwt>`."""
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="missing bearer token",
        )
    return verify_service_token(authorization.split(" ", 1)[1])
