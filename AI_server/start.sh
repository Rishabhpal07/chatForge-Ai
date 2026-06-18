#!/bin/sh
# Entrypoint for the AI service image. Selects what to run via PROCESS:
#   api    → FastAPI only (default)            — for hosts that run 2 services
#   worker → arq ingestion worker only
#   both   → worker (background) + FastAPI      — for single-container hosts (e.g. HF Spaces)
# PORT controls the API port (default 8000; some hosts set PORT, e.g. HF expects 7860).
set -e
PORT="${PORT:-8000}"

case "${PROCESS:-api}" in
  worker)
    exec arq app.workers.ingest_worker.WorkerSettings
    ;;
  both)
    arq app.workers.ingest_worker.WorkerSettings &
    exec uvicorn app.main:app --host 0.0.0.0 --port "$PORT"
    ;;
  *)
    exec uvicorn app.main:app --host 0.0.0.0 --port "$PORT"
    ;;
esac
