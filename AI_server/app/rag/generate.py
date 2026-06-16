"""Answer generation. Wraps the OpenRouter streaming client so the chat endpoint
(and tests) depend on this thin seam rather than the HTTP client directly.
"""
from __future__ import annotations

from collections.abc import AsyncIterator

from app.core.openrouter import OpenRouterClient


async def generate_stream(
    messages: list[dict[str, str]], *, model: str, temperature: float
) -> AsyncIterator[str]:
    client = OpenRouterClient()
    async for delta in client.stream_chat(messages, model=model, temperature=temperature):
        yield delta
