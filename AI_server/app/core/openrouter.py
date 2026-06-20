"""OpenRouter chat client. All generation flows through here (streaming SSE)."""
from __future__ import annotations

import asyncio
import json
import logging
from collections.abc import AsyncIterator

import httpx

from app.core.config import get_settings

logger = logging.getLogger(__name__)


class OpenRouterClient:
    def __init__(self) -> None:
        s = get_settings()
        self._base_url = s.openrouter_base_url.rstrip("/")
        self._api_key = s.openrouter_api_key
        self._default_model = s.openrouter_default_model

    def _headers(self) -> dict[str, str]:
        return {
            "Authorization": f"Bearer {self._api_key}",
            "Content-Type": "application/json",
            # Recommended by OpenRouter for attribution / rate tiers.
            "HTTP-Referer": "https://chatforge.ai",
            "X-Title": "ChatForge AI",
        }

    async def stream_chat(
        self,
        messages: list[dict[str, str]],
        *,
        model: str | None = None,
        temperature: float = 0.2,
    ) -> AsyncIterator[str]:
        """Yield incremental text deltas from a streaming chat completion."""
        if not self._api_key:
            raise RuntimeError(
                "OpenRouter API key not configured (set OPENROUTER_API_KEY)"
            )
        payload = {
            "model": model or self._default_model,
            "messages": messages,
            "temperature": temperature,
            "stream": True,
        }
        # Free models flake intermittently (HTTP 5xx / "Internal Server Error" chunks). Retry
        # a few times — but ONLY while we haven't streamed any text yet, so the user never
        # sees a partial answer twice. Once tokens have flowed, any error propagates.
        attempts = 3
        for attempt in range(attempts):
            produced = False
            try:
                async with httpx.AsyncClient(timeout=httpx.Timeout(60.0)) as client:
                    async with client.stream(
                        "POST",
                        f"{self._base_url}/chat/completions",
                        headers=self._headers(),
                        json=payload,
                    ) as resp:
                        resp.raise_for_status()
                        async for line in resp.aiter_lines():
                            if not line or not line.startswith("data: "):
                                continue
                            data = line[len("data: ") :]
                            if data == "[DONE]":
                                return
                            try:
                                chunk = json.loads(data)
                            except json.JSONDecodeError:
                                continue
                            # Error object, or keepalive/usage chunks with an EMPTY choices
                            # list — guard against both (else choices[0] → IndexError).
                            if chunk.get("error"):
                                raise RuntimeError(str(chunk["error"].get("message") or chunk["error"]))
                            choices = chunk.get("choices") or []
                            if not choices:
                                continue
                            delta = choices[0].get("delta", {}).get("content")
                            if delta:
                                produced = True
                                yield delta
                return  # stream finished cleanly
            except Exception as exc:  # noqa: BLE001 — retry transient upstream failures
                if produced or attempt == attempts - 1:
                    raise
                logger.warning("OpenRouter stream failed (attempt %d/%d): %s — retrying", attempt + 1, attempts, exc)
                await asyncio.sleep(0.8 * (attempt + 1))
