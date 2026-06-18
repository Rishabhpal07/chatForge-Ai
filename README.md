# ChatForge AI

Multi-tenant SaaS to build custom AI chatbots from PDFs, documents, and websites, then
deploy them anywhere via an embeddable widget.

## Architecture (two deployables, one Postgres)

| Service | Path | Responsibility |
|---|---|---|
| **Web / control plane** | `web/` | Next.js dashboard + marketing + `/api` (auth, bots, sources, billing). |
| **AI service / data plane** | `AI_server/` | Python FastAPI: ingestion, embeddings, pgvector retrieval, streaming RAG chat. |
| **Widget** | `widget/` | Embeddable `widget.js` (Shadow DOM). |
| **Shared types** | `packages/shared/` | zod schemas / API contracts shared across TS code. |

Tech: Next.js 16 · FastAPI · Postgres + pgvector · OpenRouter (chat) · Clerk (auth) ·
Razorpay (billing) · Redis · S3-compatible storage. Tenant isolation via Postgres RLS.

## Local development

```bash
# 1. Start infra (Postgres+pgvector, Redis, MinIO)
npm run infra:up

# 2. Install JS deps (workspaces)
npm install

# 3. Configure env
cp .env.example .env            # root (AI service + shared)
cp web/.env.local.example web/.env.local

# 4. Run migrations (see web/README) and start apps
npm run dev:web                 # Next.js  → http://localhost:3000
# (AI service) cd AI_server && uvicorn app.main:app --reload  → http://localhost:8000
```

See `docs/` for the full technical plan and ADRs.
