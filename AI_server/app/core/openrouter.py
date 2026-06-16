"""OpenRouter chat client. All generation flows through here (streaming SSE)."""
from __future__ import annotations

import json
from collections.abc import AsyncIterator

import httpx

from app.core.config import get_settings


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
                        break
                    try:
                        chunk = json.loads(data)
                    except json.JSONDecodeError:
                        continue
                    delta = (
                        chunk.get("choices", [{}])[0].get("delta", {}).get("content")
                    )
                    if delta:
                        yield delta
