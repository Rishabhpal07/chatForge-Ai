# ChatForge AI — Complete Project Guide

A single reference covering the whole system: what it is, the architecture, every
feature, how it works, and the key code. Use it to answer any question about the project.

---

## 1. What the product is

A **multi-tenant SaaS** where a business signs up, uploads its content (PDFs, DOCX, TXT,
website URLs/sitemaps), and gets a **custom AI chatbot grounded in that content**. They
embed it on their own website with a `<script>` tag. End-users chat with a bot that
answers *only* from the business's knowledge — this technique is **RAG
(Retrieval-Augmented Generation)**.

- **Multi-tenant** = one running system serves many customer companies (tenants), with
  their data strictly isolated.
- **RAG** = instead of relying on the LLM's training, we retrieve the customer's own
  relevant text and feed it to the model as context, so answers are accurate and grounded.

---

## 2. The big architectural decision: two backends

```
                    ┌──────────────────────────────────────┐
  Business owner ──▶│  Next.js app  (the "control plane")   │
  (dashboard)       │  • Dashboard UI + marketing            │
                    │  • /api/* routes (auth, bots, billing) │
                    │  • Clerk auth, Razorpay billing        │
                    └──────┬──────────────────┬──────────────┘
                           │ signed jobs       │ SQL (one DB)
                           ▼                   ▼
  Website visitor ──▶┌─────────────────┐  ┌──────────────────────┐
  (widget on their   │ FastAPI service │◀▶│ Postgres + pgvector  │
   site)             │ ("data plane")  │  └──────────────────────┘
  • widget.js        │ • Ingestion     │  ┌──────────────────────┐
  • POST /chat (SSE) │ • Embeddings    │◀▶│ Redis (job queue)    │
                     │ • Retrieval+RAG │  └──────────────────────┘
                     │ • Streaming chat│  ┌──────────────────────┐
                     └──────┬──────────┘◀▶│ S3 / MinIO (uploads) │
                            │ LLM call    └──────────────────────┘
                            ▼
                       OpenRouter
```

**Why two backends?**

- **Next.js (TypeScript)** owns the *control plane*: auth, dashboards, CRUD, billing —
  where tight Clerk + Vercel integration and SSR shine.
- **FastAPI (Python)** owns the *data plane*: PDF parsing, web crawling, embeddings,
  vector search, streaming LLM responses — where Python's ML/document ecosystem is best
  (`pypdf`, `trafilatura`, `crawl4ai`, `tiktoken`, `fastembed`).

They **share one Postgres database** and communicate over **signed internal HTTP + a
Redis job queue**.

---

## 3. Tech stack (and why each)

| Layer | Choice | Why |
|---|---|---|
| Control plane | **Next.js 16** (App Router), React 19, **Tailwind v4**, TypeScript | SSR + API routes in one deployable; Vercel-native |
| Auth | **Clerk** (Organizations = tenants) | Orgs/roles/invites out of the box |
| DB access (TS) | **Drizzle ORM** + `postgres` driver | Type-safe SQL, owns migrations |
| Data plane | **Python 3.12 + FastAPI** | Best ingestion/ML libraries, async streaming |
| Vectors | **Postgres 16 + pgvector** (HNSW index) | One DB for everything; no separate vector store |
| LLM | **OpenRouter** | One API, many models (incl. free ones) |
| Embeddings | **fastembed** (local ONNX, BGE-small, 384-dim) | Free, no API key, runs in-container |
| Queue | **Redis + arq** | Async ingestion jobs |
| Storage | **S3-compatible** (MinIO locally) | Raw file uploads |
| Billing | **Razorpay** | Subscriptions + webhooks |
| Widget | **Vanilla JS, Shadow DOM** | Isolated from host-site CSS |

---

## 4. Multi-tenancy & data isolation (the most important concept)

**Model: shared database, shared schema, row-level isolation by `tenant_id`.**

- Every table has a `tenant_id` column.
- A Clerk **Organization** = one tenant (mapped to a `tenants` row).
- Isolation is enforced by **Postgres Row-Level Security (RLS)**: each request sets a
  transaction-local variable `app.tenant_id`, and RLS policies filter every query to that
  tenant automatically.

**TypeScript side** — `web/src/db/client.ts`:

```ts
export async function withTenant<T>(tenantId: string, fn: (tx) => Promise<T>) {
  return db.transaction(async (tx) => {
    // transaction-local: auto-resets at commit/rollback
    await tx.execute(sql`SELECT set_config('app.tenant_id', ${tenantId}, true)`);
    return fn(tx);
  });
}
```

**Python side** — `AI_server/app/db/session.py` mirrors it:

```python
@asynccontextmanager
async def tenant_tx(tenant_id: str):
    async with pool.acquire() as conn:
        async with conn.transaction():
            await conn.execute("SELECT set_config('app.tenant_id', $1, true)", tenant_id)
            yield conn
```

**The RLS policy** (migration `0001_init.sql`), using `NULLIF` so an unset variable
doesn't crash the `::uuid` cast:

```sql
ALTER TABLE bots ENABLE ROW LEVEL SECURITY;
ALTER TABLE bots FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON bots
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
```

> ⚠️ **Known caveat:** the DB currently connects as a *superuser* (`chatforge`), and
> superusers **bypass RLS**. So in this dev setup isolation isn't actually enforced at the
> DB layer. For production, create a dedicated non-superuser app role — the `set_config`
> plumbing is already correct; it just needs the right role to take effect.

**Widget security nuance:** the public widget never sends a `tenant_id`. It sends a public
`bot` key; the server resolves the tenant. A `SECURITY DEFINER` function `resolve_bot()`
(migration `0002`) lets the public chat path look up an *active* bot across the RLS
boundary safely.

---

## 5. Database schema (`web/src/db/schema.ts`)

13 tables. The important ones:

| Table | Purpose | Key columns |
|---|---|---|
| `tenants` | One per Clerk org | `clerk_org_id`, `plan`, `status` |
| `users` | Mirror of Clerk users | `clerk_user_id`, `email` |
| `bots` | A chatbot | `public_key` (widget id), `system_prompt`, `model`, `allowed_domains[]`, `status` (draft/active) |
| `sources` | An uploaded file/URL | `type` (pdf/docx/txt/url/sitemap), `uri`, `storage_key`, `status` (pending/processing/ready/error) |
| `documents` | Logical doc from a source | `title`, `metadata` (a sitemap → many docs) |
| `chunks` | Embedded text pieces | `content`, `embedding vector(384)`, `token_count` — **HNSW index** for fast search |
| `conversations` | A widget chat session | `bot_id`, `visitor_id` |
| `messages` | Each chat turn | `role`, `content`, `citations`, `tokens_in/out`, `cost_usd` |
| `usage_events` | Metering | `kind` (embed/chat/ingest), `units`, `period` |
| `subscriptions` | Plan + limits | `plan`, `status`, `limits` (jsonb) |
| `audit_logs` | Sensitive actions | `actor`, `action`, `target`, `meta` |

The `chunks.embedding` column and its HNSW index are managed by **raw SQL migrations**
(Drizzle doesn't model vectors well). Migration ownership rule: `docs/ADR-001-db-ownership.md`.

**Migrations** run via a forward-only runner (`web/src/db/migrate.ts`): it applies every
new `*.sql` file in order and records it in a `_migrations` table. Files so far:
`0001_init` (schema+RLS), `0002_resolve_bot`, `0003_default_free_model`,
`0004_local_embeddings_384`.

---

## 6. Authentication flow (Clerk)

1. **Middleware** — `web/proxy.ts` (Next.js 16 renamed `middleware.ts` → `proxy.ts`):

```ts
export default clerkMiddleware();
// public routes: "/", "/sign-in", "/sign-up", "/api/widget(.*)", "/api/webhooks(.*)"
```

Everything else requires a logged-in user with an active organization.

2. **Resolving the tenant** — `web/src/lib/auth.ts` has `requireTenant()`, used by every
   protected API route:

```ts
export async function requireTenant() {
  const { userId, orgId } = await auth();
  if (!userId || !orgId) throw new UnauthorizedError();
  const tenantId = await resolveTenantId(orgId); // maps Clerk org → tenants.id
  return { userId, tenantId };
}
```

3. **Clerk webhook** — `/api/webhooks/clerk` keeps `tenants`/`users` rows synced when
   orgs/users are created in Clerk.

---

## 7. Control plane: the Next.js API (`web/app/api/*`)

Every route uses a small `handle()` wrapper (`web/src/lib/api.ts`) that maps errors to
HTTP codes: `UnauthorizedError → 401`, `LimitError → 402`, `ZodError → 400`.

Key routes:

- `POST/GET/PATCH/DELETE /api/bots[/:id]` — bot CRUD (name, model, system prompt, allowed
  domains, activate/draft).
- `POST /api/sources/presign` — returns a presigned S3 PUT URL for file uploads.
- `POST /api/sources` — register a URL/sitemap source (crawl options `deepCrawl` /
  `maxPages` / `maxDepth` flow through here), then enqueue ingestion.
- `GET /api/sources[?botId=]` — list sources (joins `bots` for the bot name).
- `POST /api/ingest` — enqueue ingestion for a finished file upload.
- `GET /api/widget/:publicKey` — **public** bot config for the widget (CORS + domain-checked).
- `GET /api/analytics`, `GET /api/conversations[/:id]` — dashboard data.
- `POST /api/billing/checkout`, `GET /api/billing` — Razorpay + usage.
- `POST /api/webhooks/{clerk,razorpay}` — signature-verified external events.

**Dashboard pages** (`web/app/(dashboard)/dashboard/*`): Overview, My Chatbots, a bot
detail page (knowledge upload + settings + a live "Playground" test chat + embed snippet),
Knowledge Base (all sources across bots), Chat History, Analytics, Settings & Billing. The
UI follows the Stitch design (Electric Indigo `#4f46e5`, Geist + JetBrains Mono).

---

## 8. The RAG pipeline — the heart of the system

### 8a. Ingestion (turning content into searchable vectors)

**Trigger flow:**

```
Dashboard → POST /api/sources (Next.js inserts row, status=pending)
          → enqueueIngestion() → POST /internal/ingest (FastAPI)
          → arq enqueues job on Redis
          → worker picks it up → run_ingestion()
```

The control plane never crawls or parses — it only inserts a row and signals the Python
service. `web/src/lib/ai-service.ts`:

```ts
const res = await fetch(`${AI_SERVICE_URL}/internal/ingest`, {
  method: "POST",
  headers: { Authorization: `Bearer ${token}` },     // signed service token
  body: JSON.stringify({ tenant_id, bot_id, source_id, type, uri, deep_crawl, ... }),
});
```

**The worker pipeline** — `AI_server/app/rag/ingest.py`:

```python
async def run_ingestion(job):
    docs = await _load_documents(job)          # 1. extract text
    async with tenant_tx(job.tenant_id) as conn:
        for doc in docs:
            chunks = chunk_text(doc.text)       # 2. split into ~800-token chunks
            vectors = await embedder.embed([c.content for c in chunks])  # 3. embed
            doc_id = await insert_document(conn, ...)
            await insert_chunks(conn, rows=[...])  # 4. store chunks + vectors
        await _set_status(conn, job.source_id, "ready")
```

**Step 1 — text extraction** (`_load_documents`):

- **Files** (pdf/docx/txt): downloaded from S3, parsed by `pypdf` / `python-docx` / plain
  decode (`loaders.py`).
- **Single URL**: `crawl_single()` — real browser (crawl4ai/Chromium) renders JS → clean
  markdown; falls back to `httpx + trafilatura` if the browser is unavailable.
- **Deep crawl** (checkbox): `crawl_deep()` — BFS over same-host links, depth/page capped.
- **Sitemap**: `crawl_sitemap()` — parses `sitemap.xml`, fetches each URL **concurrently
  with the fast path** (8 at a time). Browser-per-page across a whole site is too slow, so
  the browser is reserved for single-URL and deep crawls.

**Step 2 — chunking** (`chunker.py`): a recursive token-aware splitter (using `tiktoken`'s
`cl100k_base`). It splits on progressively finer separators so chunks stay ≤ ~800 tokens
with overlap, preserving paragraph boundaries:

```python
_SEPARATORS = ["\n\n", "\n", ". ", " ", ""]
def count_tokens(text): return len(_ENC.encode(text))
```

**Step 3 — embeddings** (`embeddings.py`): a pluggable provider. Default is **fastembed**
(free, local, 384-dim BGE-small). Swap to OpenAI (1536-dim) or "fake" (dev) via one env var:

```python
class FastEmbedEmbeddings(EmbeddingsProvider):
    async def embed(self, texts):
        model = self._get_model()              # BAAI/bge-small-en-v1.5, cached
        return await asyncio.to_thread(lambda: [v.tolist() for v in model.embed(texts)])

_PROVIDERS = {"openai": ..., "fastembed": ..., "fake": ...}
```

**Step 4 — storage** (`vectors.py`): asyncpg has no native pgvector codec, so vectors are
passed as string literals:

```python
def to_pgvector(vec): return "[" + ",".join(repr(float(v)) for v in vec) + "]"
# INSERT INTO chunks (..., embedding) VALUES (..., $7::vector, ...)
```

### 8b. Query time (answering a question)

**Retrieval** — `retriever.py` + `vectors.py`:

```python
async def retrieve(tenant_id, bot_id, query, top_k=8):
    [q_vec] = await embedder.embed([query])    # embed the question
    async with tenant_tx(tenant_id) as conn:
        return await search_chunks(conn, bot_id=bot_id, query_embedding=q_vec, top_k=k)
```

The search is a **cosine-similarity** query, scoped to one bot, using the HNSW index:

```sql
SELECT c.content, 1 - (c.embedding <=> $1::vector) AS score, s.uri
FROM chunks c JOIN documents d ON ... JOIN sources s ON ...
WHERE c.bot_id = $2 AND c.embedding IS NOT NULL
ORDER BY c.embedding <=> $1::vector     -- <=> is cosine distance
LIMIT $3
```

> With *fake* embeddings, both stored and query vectors are meaningless, so this `ORDER BY`
> returns essentially random chunks. Real embeddings (fastembed/openai) are what make
> retrieval actually work.

**Prompt building** (`prompt.py`): system prompt + retrieved chunks as context + short
history, with a strict instruction: *"answer only from the context; cite sources; say you
don't know otherwise."* This prevents hallucination.

**Generation & streaming** (`chat.py` + `openrouter.py`): the answer streams token-by-token
from OpenRouter via **Server-Sent Events (SSE)** back to the widget, then the message is
persisted with citations and token/cost. `openrouter.py` guards against an empty API key.

---

## 9. The chat endpoint security (`AI_server/app/api/chat.py`)

The public `/chat` endpoint defends itself because it's exposed to the internet:

1. **Resolve** bot+tenant from the `public_key` (only *active* bots resolve).
2. **Origin check** — request `Origin` must be in the bot's `allowed_domains`.
3. **Rate limit** — per IP+bot via Redis.
4. **Quota check** — `check_message_quota()` returns **402** if the tenant exceeded its
   monthly message limit (free tier = 200).
5. Only then does it retrieve + stream.

---

## 10. The embeddable widget (`widget/` → `web/public/widget.js`)

A single self-contained script the customer drops on their site:

```html
<script src="https://yourcdn/widget.js" data-bot="pk_live_xxx" async></script>
```

- Renders inside a **Shadow DOM** so the host site's CSS can't bleed in or out.
- Bootstraps config from `GET /api/widget/:publicKey` (theme, welcome message).
- Streams chat from the FastAPI `/chat` SSE endpoint.
- Only ever holds the **public key** — no secrets.
- `web/public/widget-demo.html` is a test harness.

---

## 11. Billing, plans & limit enforcement

**Plans** (`packages/shared`): free / pro / scale, each with `limits` (max bots, sources,
monthly messages).

**Enforcement** (`web/src/lib/limits.ts`): before creating a bot or adding a source, the
API calls `assertCanCreateBot()` / `assertCanAddSource()`, which throw `LimitError` →
**HTTP 402** with an upgrade hint. The chat path enforces message quota in Python.

**Checkout** (`web/src/lib/razorpay.ts` — REST, no SDK):

```
Settings page → POST /api/billing/checkout → createOrder() → Razorpay Checkout opens
→ payment → Razorpay webhook (HMAC-verified) → /api/webhooks/razorpay flips subscription
```

The webhook reads tenant+plan from the order notes and activates the subscription. It's a
no-op if `RAZORPAY_*` keys aren't set (the UI shows "billing not configured").

**Metering**: every embed/chat/ingest writes a `usage_event` row; the Settings page shows
usage-vs-limit bars.

---

## 12. Analytics & audit

- **Analytics** (`/api/analytics`): conversation counts, message volume, usage rollups.
- **Audit log** (`web/src/lib/audit.ts`): `writeAudit({tenantId, actor, action, target,
  meta})` records sensitive actions (bot activated, subscription changed). Shown under
  Settings → Recent activity.

---

## 13. Internal service auth (cross-language JWT)

Next.js calls FastAPI's `/internal/*` with a **short-lived signed token**, never raw client
input. Both sides share `INTERNAL_JWT_SECRET`:

- Node signs with `jose` (`web/src/lib/internal-token.ts`).
- Python verifies with `PyJWT` (`AI_server/app/core/security.py`), and checks the token's
  `tenant_id` matches the job's. This is why a malicious widget can't trigger cross-tenant
  ingestion.

---

## 14. Local dev & infra (`infra/docker-compose.yml`)

One command brings up everything:

```bash
docker compose -f infra/docker-compose.yml up -d
```

Services: **postgres** (pgvector, host port 5433 to avoid clashing with native PG),
**redis**, **minio** (+ a `minio-init` that creates the bucket), and the **ai** + **worker**
containers (both built from `AI_server/Dockerfile`, `restart: unless-stopped` so they
survive laptop sleeps).

The web app runs separately (`npm run dev:web` → :3000). Migrations:
`cd web && npm run db:migrate`.

**Re-ingesting after an embeddings change** (`AI_server/app/reingest.py`):

```bash
docker exec chatforge-worker python -m app.reingest        # all tenants
docker exec chatforge-worker python -m app.reingest <tenant_id>
```

---

## 15. Deployment target (when going live)

| Component | Where |
|---|---|
| Next.js | Vercel |
| FastAPI ai + worker | Render / Railway / Fly.io (same Docker image, two commands) |
| Postgres + pgvector | Neon / Supabase |
| Redis | Upstash |
| Storage | Cloudflare R2 / S3 |
| Widget | served from Next `/public` or a CDN |

**Pre-launch checklist:** real embeddings (done), lock CORS, fresh `INTERNAL_JWT_SECRET`,
Clerk production keys, a non-superuser DB role (so RLS actually bites), and Razorpay keys.

---

## 16. Repository layout

```
chatForge-AI/
├─ web/                  # Next.js control plane + dashboard
│  ├─ app/(dashboard)/   # authed dashboard pages
│  ├─ app/api/           # control-plane API routes
│  ├─ src/db/            # Drizzle schema, migrations, RLS client
│  ├─ src/lib/           # auth, limits, audit, razorpay, ai-service, internal-token
│  ├─ src/components/    # UI primitives, Sidebar
│  ├─ proxy.ts           # Clerk middleware
│  └─ public/widget.js   # built widget bundle
├─ AI_server/            # Python FastAPI data plane
│  ├─ app/api/           # chat.py, ingest.py, health
│  ├─ app/rag/           # loaders, crawler, chunker, embeddings, retriever, prompt, ingest
│  ├─ app/db/            # session (RLS), vectors, chat_repo
│  ├─ app/core/          # config, security (JWT), openrouter, storage
│  ├─ app/workers/       # arq ingest worker
│  ├─ app/reingest.py    # re-enqueue all sources
│  └─ Dockerfile
├─ widget/               # widget source (TS → bundle)
├─ packages/shared/      # zod schemas / contracts shared across TS
├─ infra/                # docker-compose (pg+pgvector, redis, minio, ai, worker)
└─ docs/                 # this guide + ADRs
```

---

## 17. The 30-second elevator version

> *"It's a multi-tenant RAG SaaS. Next.js handles auth/dashboard/billing; a Python FastAPI
> service handles document ingestion, embeddings, and streaming chat. Customers upload PDFs
> or crawl their website; we extract text, chunk it, embed it into pgvector, and store it.
> Their embeddable widget sends questions to the chat endpoint, which embeds the question,
> does a cosine vector search scoped to that bot, builds a grounded prompt, and streams the
> answer back from OpenRouter — with tenant isolation via Postgres RLS, Clerk organizations
> as tenants, and Razorpay for billing."*
