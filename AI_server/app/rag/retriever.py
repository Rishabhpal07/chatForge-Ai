"""Query-time retrieval: embed the question, cosine-search the bot's chunks."""
from __future__ import annotations

from app.core.config import get_settings
from app.db.session import tenant_tx
from app.db.vectors import RetrievedChunk, search_chunks
from app.rag.embeddings import get_embeddings_provider


async def retrieve(
    *, tenant_id: str, bot_id: str, query: str, top_k: int | None = None
) -> list[RetrievedChunk]:
    k = top_k or get_settings().retrieval_top_k
    embedder = get_embeddings_provider()
    [query_embedding] = await embedder.embed([query])
    async with tenant_tx(tenant_id) as conn:
        return await search_chunks(
            conn, bot_id=bot_id, query_embedding=query_embedding, top_k=k
        )
