from app.rag.chunker import chunk_text, count_tokens


def test_chunk_splits_long_text_with_sequential_ordinals():
    text = ("Sentence about ducks. " * 400).strip()
    chunks = chunk_text(text, max_tokens=100, overlap_tokens=20)

    assert len(chunks) > 1
    assert [c.ordinal for c in chunks] == list(range(len(chunks)))
    # each chunk respects the budget (allow overlap headroom)
    assert all(c.token_count <= 130 for c in chunks)
    assert all(c.content.strip() for c in chunks)


def test_short_text_is_single_chunk():
    chunks = chunk_text("Just a little text.", max_tokens=800)
    assert len(chunks) == 1
    assert chunks[0].token_count == count_tokens("Just a little text.")


def test_empty_text_yields_no_chunks():
    assert chunk_text("   ") == []
