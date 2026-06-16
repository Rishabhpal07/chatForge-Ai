"""Pluggable embeddings provider.

OpenRouter's chat coverage is broad but its embeddings coverage is thin, so embeddings
sit behind this interface (see plan). Default = OpenAI text-embedding-3-small (1536-d).
Swap by setting EMBEDDINGS_PROVIDER / EMBEDDINGS_MODEL.
"""
from __future__ import annotations

from abc import ABC, abstractmethod

import httpx

from app.core.config import get_settings


class EmbeddingsProvider(ABC):
    dim: int

    @abstractmethod
    async def embed(self, texts: list[str]) -> list[list[float]]:
        """Return one embedding vector per input text, in order."""


class OpenAIEmbeddings(EmbeddingsProvider):
    def __init__(self) -> None:
        s = get_settings()
        self._api_key = s.openai_api_key
        self._model = s.embeddings_model
        self.dim = s.embeddings_dim

    async def embed(self, texts: list[str]) -> list[list[float]]:
        if not texts:
            return []
        async with httpx.AsyncClient(timeout=httpx.Timeout(60.0)) as client:
            resp = await client.post(
                "https://api.openai.com/v1/embeddings",
                headers={"Authorization": f"Bearer {self._api_key}"},
                json={"model": self._model, "input": texts},
            )
            resp.raise_for_status()
            data = resp.json()["data"]
        # API preserves request order, but sort by index defensively.
        data.sort(key=lambda d: d["index"])
        return [d["embedding"] for d in data]


class FastEmbedEmbeddings(EmbeddingsProvider):
    """Local ONNX embeddings via fastembed — no API key, no per-token cost, offline.

    Default model BAAI/bge-small-en-v1.5 (384-dim). The model is downloaded once and
    cached; the loaded instance is cached at class level so repeated jobs reuse it.
    fastembed is synchronous, so embedding runs in a thread to avoid blocking the loop.
    """

    _model = None  # class-level cache of the loaded model
    _model_name: str | None = None

    def __init__(self) -> None:
        s = get_settings()
        self._name = s.embeddings_model
        self.dim = s.embeddings_dim

    def _get_model(self):
        if FastEmbedEmbeddings._model is None or FastEmbedEmbeddings._model_name != self._name:
            from fastembed import TextEmbedding

            FastEmbedEmbeddings._model = TextEmbedding(model_name=self._name)
            FastEmbedEmbeddings._model_name = self._name
        return FastEmbedEmbeddings._model

    async def embed(self, texts: list[str]) -> list[list[float]]:
        if not texts:
            return []
        import asyncio

        model = self._get_model()
        return await asyncio.to_thread(lambda: [v.tolist() for v in model.embed(texts)])


class FakeEmbeddings(EmbeddingsProvider):
    """Deterministic, network-free embeddings for local dev & tests.

    Hashes token-ish features into a fixed-dim vector and L2-normalizes, so similar
    text lands near each other — good enough to exercise the pgvector path offline.
    """

    def __init__(self) -> None:
        self.dim = get_settings().embeddings_dim

    async def embed(self, texts: list[str]) -> list[list[float]]:
        import hashlib
        import math

        out: list[list[float]] = []
        for text in texts:
            vec = [0.0] * self.dim
            for word in text.lower().split():
                h = int(hashlib.md5(word.encode()).hexdigest(), 16)
                vec[h % self.dim] += 1.0
            norm = math.sqrt(sum(v * v for v in vec)) or 1.0
            out.append([v / norm for v in vec])
        return out


_PROVIDERS = {
    "openai": OpenAIEmbeddings,
    "fastembed": FastEmbedEmbeddings,
    "local": FastEmbedEmbeddings,  # alias
    "fake": FakeEmbeddings,
}


def get_embeddings_provider() -> EmbeddingsProvider:
    name = get_settings().embeddings_provider
    try:
        return _PROVIDERS[name]()
    except KeyError as exc:
        raise ValueError(f"unknown embeddings provider: {name}") from exc
