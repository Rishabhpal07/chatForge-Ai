"""Token-aware recursive text chunking.

Splits text on progressively finer separators so chunks stay close to a target token
budget with a small overlap, preserving paragraph/sentence boundaries where possible.
"""
from __future__ import annotations

from dataclasses import dataclass

import tiktoken

# cl100k_base is a good general-purpose tokenizer and avoids per-model lookups.
_ENC = tiktoken.get_encoding("cl100k_base")

_SEPARATORS = ["\n\n", "\n", ". ", " ", ""]


@dataclass
class Chunk:
    ordinal: int
    content: str
    token_count: int


def count_tokens(text: str) -> int:
    return len(_ENC.encode(text))


def _split_recursive(text: str, max_tokens: int, separators: list[str]) -> list[str]:
    """Break `text` into pieces each <= max_tokens, using the coarsest separator that works."""
    if count_tokens(text) <= max_tokens:
        return [text] if text.strip() else []

    sep = separators[0] if separators else ""
    rest = separators[1:] if len(separators) > 1 else [""]

    if sep == "":
        # Hard fallback: slice by tokens.
        tokens = _ENC.encode(text)
        return [
            _ENC.decode(tokens[i : i + max_tokens])
            for i in range(0, len(tokens), max_tokens)
        ]

    pieces: list[str] = []
    for part in text.split(sep):
        if not part:
            continue
        if count_tokens(part) <= max_tokens:
            pieces.append(part)
        else:
            pieces.extend(_split_recursive(part, max_tokens, rest))
    return pieces


def chunk_text(
    text: str, *, max_tokens: int = 800, overlap_tokens: int = 100
) -> list[Chunk]:
    """Produce overlapping chunks near `max_tokens`, merging small pieces greedily."""
    pieces = _split_recursive(text.strip(), max_tokens, _SEPARATORS)

    chunks: list[Chunk] = []
    buf: list[str] = []
    buf_tokens = 0

    def flush() -> None:
        nonlocal buf, buf_tokens
        if not buf:
            return
        content = " ".join(buf).strip()
        if content:
            chunks.append(Chunk(len(chunks), content, count_tokens(content)))
        buf, buf_tokens = [], 0

    for piece in pieces:
        ptoks = count_tokens(piece)
        if buf_tokens + ptoks > max_tokens and buf:
            flush()
            # carry overlap: keep tail pieces up to overlap_tokens
            if overlap_tokens > 0 and chunks:
                tail = _tail_tokens(chunks[-1].content, overlap_tokens)
                if tail:
                    buf, buf_tokens = [tail], count_tokens(tail)
        buf.append(piece)
        buf_tokens += ptoks

    flush()
    return chunks


def _tail_tokens(text: str, n: int) -> str:
    tokens = _ENC.encode(text)
    return _ENC.decode(tokens[-n:]) if tokens else ""
