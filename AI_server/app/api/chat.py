"""Public streaming RAG chat endpoint (called by the embeddable widget).

Security: tenant is derived from the bot resolved via public_key (never client input);
Origin is checked against the bot's allowed_domains; requests are rate-limited per
bot+IP. The answer streams back as Server-Sent Events.
"""
from __future__ import annotations

import asyncio
import json
import logging
from collections.abc import AsyncIterator
from urllib.parse import urlparse

from fastapi import APIRouter, HTTPException, Request, status
from fastapi.responses import StreamingResponse

from app.core.ratelimit import allow
from app.db import chat_repo
from app.rag import generate, prompt, retriever
from app.schemas.contracts import ChatRequest, Citation

logger = logging.getLogger(__name__)


def _friendly_error(exc: Exception) -> str:
    """Turn an upstream/generation error into a calm, user-safe message (never leak the
    provider URL, stack, or status text to the end user)."""
    status_code = getattr(getattr(exc, "response", None), "status_code", None)
    if status_code == 429:
        return "I'm getting a lot of requests right now — please wait a few seconds and try again."
    if status_code in (401, 402, 403):
        return "The assistant is temporarily unavailable. Please try again later."
    return "Sorry, I couldn't generate a response just now. Please try again in a moment."

router = APIRouter(tags=["chat"])

RATE_LIMIT = 30  # messages
RATE_WINDOW = 60  # seconds


def _host(value: str | None) -> str | None:
    if not value:
        return None
    parsed = urlparse(value if "//" in value else f"//{value}")
    return parsed.hostname or value


def _origin_allowed(origin: str | None, allowed_domains: list[str]) -> bool:
    if not allowed_domains:  # unconfigured bot (e.g. draft/testing) → allow
        return True
    host = _host(origin)
    return host is not None and any(host == _host(d) for d in allowed_domains)


def _sse(event: dict) -> str:
    return f"data: {json.dumps(event)}\n\n"


@router.post("/chat")
async def chat(req: ChatRequest, request: Request) -> StreamingResponse:
    bot = await chat_repo.resolve_bot(req.public_key)
    if bot is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="bot not found")

    origin = request.headers.get("origin") or request.headers.get("referer")
    if not _origin_allowed(origin, bot.allowed_domains):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="origin not allowed")

    client_ip = request.client.host if request.client else "unknown"
    if not await allow(f"chat:{bot.id}:{client_ip}", limit=RATE_LIMIT, window_seconds=RATE_WINDOW):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail="rate limit exceeded"
        )

    # Plan quota: reject when the tenant is over its monthly message allowance.
    allowed, _used, limit = await chat_repo.check_message_quota(bot.tenant_id)
    if not allowed:
        raise HTTPException(
            status_code=status.HTTP_402_PAYMENT_REQUIRED,
            detail=f"monthly message limit reached ({limit}). Upgrade your plan.",
        )

    # Retrieval (embed + vector search) and conversation/history are independent —
    # run them concurrently to cut time-to-first-token.
    async def _conversation_and_history() -> tuple[str, list[dict[str, str]]]:
        cid = await chat_repo.ensure_conversation(
            tenant_id=bot.tenant_id,
            bot_id=bot.id,
            visitor_id=req.visitor_id,
            conversation_id=req.conversation_id,
        )
        # Load prior turns BEFORE inserting the current message, so follow-ups like
        # "explain in more detail" have the earlier Q&A as context.
        hist = await chat_repo.get_recent_messages(
            tenant_id=bot.tenant_id, conversation_id=cid, limit=8
        )
        return cid, hist

    chunks, (conversation_id, history) = await asyncio.gather(
        retriever.retrieve(tenant_id=bot.tenant_id, bot_id=bot.id, query=req.message),
        _conversation_and_history(),
    )
    await chat_repo.insert_message(
        tenant_id=bot.tenant_id,
        conversation_id=conversation_id,
        role="user",
        content=req.message,
    )

    citations = [
        Citation(
            document_id=c.document_id,
            source_uri=c.source_uri,
            chunk_id=c.chunk_id,
            score=c.score,
            snippet=c.content[:240],
        )
        for c in chunks
    ]
    messages = prompt.build_messages(
        bot_system_prompt=bot.system_prompt, chunks=chunks, history=history, question=req.message
    )

    async def event_stream() -> AsyncIterator[str]:
        yield _sse({"type": "citations", "citations": [c.model_dump() for c in citations]})
        parts: list[str] = []
        try:
            async for delta in generate.generate_stream(
                messages, model=bot.model, temperature=bot.temperature
            ):
                parts.append(delta)
                yield _sse({"type": "token", "text": delta})
        except Exception as exc:  # noqa: BLE001 — surface generation failure to client
            logger.warning("generation failed for bot %s: %s", bot.id, exc)
            yield _sse({"type": "error", "code": "generation_failed", "message": _friendly_error(exc)})
            return

        answer = "".join(parts)
        message_id = await chat_repo.insert_message(
            tenant_id=bot.tenant_id,
            conversation_id=conversation_id,
            role="assistant",
            content=answer,
            citations=[c.model_dump() for c in citations],
            model=bot.model,
        )
        await chat_repo.record_chat_usage(tenant_id=bot.tenant_id, bot_id=bot.id)
        yield _sse(
            {"type": "done", "conversationId": conversation_id, "messageId": message_id}
        )

    return StreamingResponse(event_stream(), media_type="text/event-stream")
