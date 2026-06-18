#!/usr/bin/env bash
# Starts the FastAPI AI service + ingestion worker for local dev.
# Env (DATABASE_URL, REDIS_URL, OPENROUTER_API_KEY, EMBEDDINGS_PROVIDER, ...) is read
# from the repo-root .env by the app config. Run this in its OWN terminal so the
# processes survive — Ctrl-C stops both.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT/AI_server"

VENV="$ROOT/AI_server/.venv/bin"

echo "▶ starting AI service on :8000 and ingestion worker (Ctrl-C to stop both)"
"$VENV/uvicorn" app.main:app --host 127.0.0.1 --port 8000 --reload --log-level info &
UVICORN_PID=$!
"$VENV/arq" app.workers.ingest_worker.WorkerSettings &
WORKER_PID=$!

trap 'echo; echo "stopping…"; kill $UVICORN_PID $WORKER_PID 2>/dev/null || true' INT TERM
wait
