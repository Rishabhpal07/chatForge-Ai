---
title: ChatForge AI Service
emoji: 🔥
colorFrom: indigo
colorTo: purple
sdk: docker
app_port: 8000
pinned: false
---

# ChatForge AI Service

FastAPI data plane for ChatForge AI: document ingestion (PDF/DOCX/TXT/URL/sitemap),
embeddings (fastembed BGE-small, 384-dim), pgvector retrieval, and streaming RAG chat
over OpenRouter. The same image runs the API and the arq ingestion worker.

This Space runs with `PROCESS=both` (API + background worker in one container).

## Required secrets (set in Space → Settings → Variables and secrets)

| Key | Notes |
|---|---|
| `DATABASE_URL` | Neon pooled connection string |
| `REDIS_URL` | Upstash `rediss://…` URL |
| `INTERNAL_JWT_SECRET` | must match the Vercel web app exactly |
| `OPENROUTER_API_KEY` | LLM generation |
| `S3_ENDPOINT` `S3_REGION` `S3_BUCKET` `S3_ACCESS_KEY_ID` `S3_SECRET_ACCESS_KEY` | Cloudflare R2 |
| `EMBEDDINGS_PROVIDER` `EMBEDDINGS_MODEL` `EMBEDDINGS_DIM` | `fastembed` / `BAAI/bge-small-en-v1.5` / `384` |
| `PROCESS` | `both` |
