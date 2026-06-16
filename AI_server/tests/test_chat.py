import uuid
from collections.abc import AsyncIterator

import pytest
from httpx import ASGITransport, AsyncClient

from app.core import storage
from app.db.session import tenant_tx
from app.main import app
from app.rag import generate, ingest
from app.schemas.contracts import IngestJob


async def _fake_stream(messages, *, model, temperature) -> AsyncIterator[str]:
    for tok in ["Paris", " is", " the", " capital", " [1]"]:
        yield tok


def _parse_sse(text: str) -> list[dict]:
    import json

    return [
        json.loads(line[len("data: ") :])
        for line in text.splitlines()
        if line.startswith("data: ")
    ]


@pytest.mark.asyncio
async def test_chat_streams_grounded_answer(tenant, monkeypatch):
    tenant_id, bot_id, public_key = (
        tenant["tenant_id"],
        tenant["bot_id"],
        tenant["public_key"],
    )

    # bot must be active to be resolvable by public_key
    async with tenant_tx(tenant_id) as conn:
        await conn.execute("UPDATE bots SET status='active' WHERE id=$1", bot_id)

    # ingest some grounding content (inject bytes; stub embeddings via env=fake)
    source_id = str(uuid.uuid4())
    async with tenant_tx(tenant_id) as conn:
        await conn.execute(
            """INSERT INTO sources (id, tenant_id, bot_id, type, uri, storage_key, status)
               VALUES ($1,$2,$3,'txt','kb.txt','k','pending')""",
            source_id,
            tenant_id,
            bot_id,
        )
    monkeypatch.setattr(
        storage, "download_bytes", lambda key: b"The capital of France is Paris. " * 50
    )
    await ingest.run_ingestion(
        IngestJob(
            tenant_id=tenant_id,
            source_id=source_id,
            bot_id=bot_id,
            type="txt",
            uri="kb.txt",
            storage_key="k",
        )
    )

    # stub the LLM stream so no OpenRouter key is needed
    monkeypatch.setattr(generate, "generate_stream", _fake_stream)

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.post(
            "/chat",
            json={
                "public_key": public_key,
                "visitor_id": "visitor-1",
                "message": "What is the capital of France?",
            },
        )
        assert resp.status_code == 200
        events = _parse_sse(resp.text)

    types = [e["type"] for e in events]
    assert types[0] == "citations"
    assert "token" in types
    assert types[-1] == "done"

    answer = "".join(e["text"] for e in events if e["type"] == "token")
    assert "Paris" in answer

    citations_event = events[0]
    assert len(citations_event["citations"]) >= 1

    # answer persisted
    done = events[-1]
    async with tenant_tx(tenant_id) as conn:
        role = await conn.fetchval(
            "SELECT role FROM messages WHERE id=$1", done["messageId"]
        )
        msg_count = await conn.fetchval(
            "SELECT count(*) FROM messages WHERE conversation_id=$1",
            done["conversationId"],
        )
    assert role == "assistant"
    assert msg_count == 2  # user + assistant


@pytest.mark.asyncio
async def test_chat_unknown_bot_404(tenant):
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.post(
            "/chat",
            json={"public_key": "pk_does_not_exist", "visitor_id": "v", "message": "hi"},
        )
    assert resp.status_code == 404
