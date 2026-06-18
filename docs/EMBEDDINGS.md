
# Embeddings in ChatForge AI

How text is turned into vectors, stored, and searched — with a real sample.

---

## 1. What an embedding is here

An **embedding** is a fixed-length list of numbers (a vector) that represents the *meaning*
of a piece of text. Texts with similar meaning produce vectors that are close together, so
we can find "the most relevant chunks for a question" by comparing vectors instead of
matching keywords. This is the core of the RAG retrieval step.

In ChatForge every `chunks` row stores one embedding for its `content`.

---

## 2. The model & dimensions

| Property | Value |
|---|---|
| Provider | **fastembed** (local ONNX, no API key, free) |
| Model | **BAAI/bge-small-en-v1.5** |
| Dimensions | **384** |
| Normalization | L2-normalized (unit length) |
| Distance metric | cosine (pgvector `<=>`) |
| Where it runs | inside the AI service / worker container (CPU) |

It's behind a pluggable interface, so you can switch via env vars:

| `EMBEDDINGS_PROVIDER` | Model | Dim | Notes |
|---|---|---|---|
| `fastembed` (default) | BAAI/bge-small-en-v1.5 | 384 | free, local, offline |
| `openai` | text-embedding-3-small | 1536 | needs `OPENAI_API_KEY`, paid |
| `fake` | hashed pseudo-vectors | configurable | dev/tests only — **meaningless**, retrieval is random |

> ⚠️ The dimension **must match** the `chunks.embedding vector(N)` column (set to **384** by
> migration `0004`). Changing provider/dimension requires a schema change **and a re-ingest**,
> because existing vectors can't be reused. (Re-ingest: `docker exec chatforge-worker python -m app.reingest`.)

---

## 3. A real embedding (from the robu.in test crawl)

A chunk from `robu.in` and the start of its 384-dim vector:

```text
chunk content : "* [](tel:18002666123) [![Site Logo](https://robu.in/_next/image/?url=%2Fimages%2Flogo.png&…"
token_count   : 456
dimensions    : 384
first 8 values: -0.05074, -0.04606, -0.00626, -0.00824, 0.06103, -0.00216, -0.02397, 0.04500
L2 norm       : 1.0000   (unit vector → cosine similarity = dot product)
```

The full vector is 384 floats. It's stored in Postgres as a `pgvector` literal:
`[-0.05074,-0.04606,…,0.04500]`.

---

## 4. How it's generated (ingestion)

`AI_server/app/rag/embeddings.py` — the fastembed provider:

```python
class FastEmbedEmbeddings(EmbeddingsProvider):
    async def embed(self, texts: list[str]) -> list[list[float]]:
        model = self._get_model()              # BAAI/bge-small-en-v1.5, cached after first load
        # fastembed is sync → run off the event loop
        return await asyncio.to_thread(lambda: [v.tolist() for v in model.embed(texts)])
```

During ingestion (`rag/ingest.py`): each document is chunked (~800 tokens), all chunk texts
are embedded **in a batch**, and stored:

```
text → chunk_text() → embedder.embed([...]) → insert_chunks(... embedding ...)
```

---

## 5. How it's stored (pgvector)

`chunks.embedding` is a `vector(384)` column with an **HNSW** index for fast approximate
nearest-neighbour search (`vector_cosine_ops`). asyncpg has no native vector codec, so the
list is written as a string literal (`db/vectors.py`):

```python
def to_pgvector(vec): return "[" + ",".join(repr(float(v)) for v in vec) + "]"
# INSERT INTO chunks (..., embedding) VALUES (..., $7::vector, ...)
```

---

## 6. How it's searched (query time)

At question time (`rag/retriever.py` → `db/vectors.py`) the **question is embedded with the
same model**, then pgvector returns the closest chunks by cosine distance, scoped to one bot:

```sql
SELECT c.content,
       1 - (c.embedding <=> $1::vector) AS score,   -- cosine similarity (1 = identical)
       s.uri AS source_uri
FROM chunks c
JOIN documents d ON d.id = c.document_id
JOIN sources   s ON s.id = d.source_id
WHERE c.bot_id = $2 AND c.embedding IS NOT NULL
ORDER BY c.embedding <=> $1::vector              -- nearest first
LIMIT $3;                                         -- top-k (default 8)
```

Those top-k chunks become the grounded context handed to the LLM.

---

## 7. Config (env)

```bash
EMBEDDINGS_PROVIDER=fastembed
EMBEDDINGS_MODEL=BAAI/bge-small-en-v1.5
EMBEDDINGS_DIM=384
OPENAI_API_KEY=          # only needed if EMBEDDINGS_PROVIDER=openai
```

---

## 8. One-line summary

> Each chunk's text is turned into a **384-dim, L2-normalized vector** by the local
> **fastembed BGE-small** model, stored in a pgvector `vector(384)` HNSW index, and matched
> against the (identically embedded) question via **cosine similarity** to retrieve the
> top-k most relevant chunks for grounding.
