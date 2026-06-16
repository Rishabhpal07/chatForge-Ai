import uuid

import pytest

from app.core import storage
from app.db.session import tenant_tx
from app.rag.ingest import run_ingestion
from app.schemas.contracts import IngestJob


@pytest.mark.asyncio
async def test_txt_ingestion_creates_chunks(tenant, monkeypatch):
    tenant_id, bot_id = tenant["tenant_id"], tenant["bot_id"]
    source_id = str(uuid.uuid4())
    storage_key = f"{tenant_id}/{bot_id}/{source_id}/notes.txt"

    # Inject the file bytes directly so the test doesn't depend on object storage.
    body = ("The capital of France is Paris. " * 80).encode()
    monkeypatch.setattr(storage, "download_bytes", lambda key: body)

    async with tenant_tx(tenant_id) as conn:
        await conn.execute(
            """INSERT INTO sources (id, tenant_id, bot_id, type, uri, storage_key, status)
               VALUES ($1,$2,$3,'txt','notes.txt',$4,'pending')""",
            source_id,
            tenant_id,
            bot_id,
            storage_key,
        )

    result = await run_ingestion(
        IngestJob(
            tenant_id=tenant_id,
            source_id=source_id,
            bot_id=bot_id,
            type="txt",
            uri="notes.txt",
            storage_key=storage_key,
        )
    )

    assert result.status == "ready"
    assert result.documents == 1
    assert result.chunks >= 1

    async with tenant_tx(tenant_id) as conn:
        n = await conn.fetchval("SELECT count(*) FROM chunks WHERE bot_id=$1", bot_id)
        status = await conn.fetchval("SELECT status FROM sources WHERE id=$1", source_id)
        embedded = await conn.fetchval(
            "SELECT count(*) FROM chunks WHERE bot_id=$1 AND embedding IS NOT NULL", bot_id
        )
    assert n == result.chunks
    assert embedded == result.chunks
    assert status == "ready"
