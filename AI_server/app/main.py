"""ChatForge AI data plane — FastAPI entrypoint.

Run locally:  uvicorn app.main:app --reload  (from AI_server/)
"""
from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import chat, health, ingest
from app.db.session import close_pool, init_pool


@asynccontextmanager
async def lifespan(_: FastAPI):
    await init_pool()
    yield
    await close_pool()


def create_app() -> FastAPI:
    app = FastAPI(title="ChatForge AI Service", version="0.1.0", lifespan=lifespan)
    # The widget/playground call /chat cross-origin from arbitrary customer sites.
    # Real authorization is the public_key + per-bot allowed_domains check inside the
    # handler, so a permissive CORS layer here is correct (no cookies/credentials).
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_methods=["*"],
        allow_headers=["*"],
    )
    app.include_router(health.router)
    app.include_router(ingest.router)
    app.include_router(chat.router)
    return app


app = create_app()
