# ChatForge AI service. Same image runs the API and the queue worker
# (override the command for the worker: `arq app.workers.ingest_worker.WorkerSettings`).
FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    PYTHONPATH=/srv

WORKDIR /srv

# System deps for PDF/doc parsing.
RUN apt-get update \
    && apt-get install -y --no-install-recommends build-essential libxml2-dev libxslt1-dev \
    && rm -rf /var/lib/apt/lists/*

COPY pyproject.toml ./
COPY app ./app
COPY start.sh ./start.sh
RUN chmod +x ./start.sh && pip install --upgrade pip && pip install .

# crawl4ai needs a headless Chromium (+ its OS libs) for JS-rendered crawling.
# `--with-deps` pulls the required system packages; the browser is baked into the image.
RUN playwright install --with-deps chromium

# Pre-download the local embeddings model so the first ingest doesn't pay the fetch.
RUN python -c "from fastembed import TextEmbedding; TextEmbedding(model_name='BAAI/bge-small-en-v1.5')"

EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
    CMD python -c "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://localhost:8000/health').status==200 else 1)"

# Run via the entrypoint: set PROCESS=api|worker|both (default api). For a single-container
# host (e.g. Hugging Face Spaces) use PROCESS=both; for 2 services run one api + one worker.
CMD ["./start.sh"]
