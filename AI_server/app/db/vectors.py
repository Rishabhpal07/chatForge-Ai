"""Vector persistence + similarity search over the `chunks` table.

asyncpg has no native pgvector codec, so embeddings are passed as `'[...]'::vector`
literals. All queries run inside a `tenant_tx` (RLS-scoped) connection.
"""
from __future__ import annotations

from dataclasses import dataclass

import asyncpg


def to_pgvector(vec: list[float]) -> str:
    """Format a float list as a pgvector literal: [v1,v2,...].

    %.7g keeps full float32 precision (what embedding models emit) while cutting the
    literal's size ~2.5× vs repr() — smaller INSERT payloads and query strings."""
    return "[" + ",".join("%.7g" % float(v) for v in vec) + "]"


async def insert_document(
    conn: asyncpg.Connection, *, tenant_id: str, source_id: str, title: str, metadata: dict
) -> str:
    row = await conn.fetchrow(
        """
        INSERT INTO documents (tenant_id, source_id, title, metadata)
        VALUES ($1, $2, $3, $4::jsonb)
        RETURNING id
        """,
        tenant_id,
        source_id,
        title,
        _json(metadata),
    )
    return str(row["id"])


async def insert_chunks(
    conn: asyncpg.Connection,
    *,
    tenant_id: str,
    bot_id: str,
    document_id: str,
    rows: list[tuple[int, str, int, list[float], dict]],
) -> int:
    """Bulk-insert (ordinal, content, token_count, embedding, metadata) tuples."""
    if not rows:
        return 0
    records = [
        (tenant_id, bot_id, document_id, ordinal, content, token_count, to_pgvector(emb), _json(meta))
        for (ordinal, content, token_count, emb, meta) in rows
    ]
    await conn.executemany(
        """
        INSERT INTO chunks
          (tenant_id, bot_id, document_id, ordinal, content, token_count, embedding, metadata)
        VALUES ($1, $2, $3, $4, $5, $6, $7::vector, $8::jsonb)
        """,
        records,
    )
    return len(records)


@dataclass
class RetrievedChunk:
    chunk_id: str
    document_id: str
    content: str
    score: float
    source_uri: str


async def search_chunks(
    conn: asyncpg.Connection,
    *,
    bot_id: str,
    query_embedding: list[float],
    top_k: int = 8,
) -> list[RetrievedChunk]:
    """Cosine-similarity search within one bot's chunks (RLS already scopes tenant)."""
    rows = await conn.fetch(
        """
        SELECT c.id, c.document_id, c.content,
               1 - (c.embedding <=> $1::vector) AS score,
               s.uri AS source_uri
        FROM chunks c
        JOIN documents d ON d.id = c.document_id
        JOIN sources s ON s.id = d.source_id
        WHERE c.bot_id = $2 AND c.embedding IS NOT NULL
        ORDER BY c.embedding <=> $1::vector
        LIMIT $3
        """,
        to_pgvector(query_embedding),
        bot_id,
        top_k,
    )
    return [
        RetrievedChunk(
            chunk_id=str(r["id"]),
            document_id=str(r["document_id"]),
            content=r["content"],
            score=float(r["score"]),
            source_uri=r["source_uri"],
        )
        for r in rows
    ]


def _json(obj: dict) -> str:
    import json

    return json.dumps(obj)
