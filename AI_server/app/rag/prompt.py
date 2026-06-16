"""Grounded prompt construction for RAG answers."""
from __future__ import annotations

from app.db.vectors import RetrievedChunk

_GROUNDING = (
    "You are a helpful assistant for a specific website. Answer the user's question "
    "using ONLY the context below. If the answer is not in the context, say you don't "
    "know and suggest contacting support — do not invent facts. Cite sources inline as "
    "[1], [2] matching the numbered context blocks."
)


def build_context_block(chunks: list[RetrievedChunk]) -> str:
    blocks = []
    for i, c in enumerate(chunks, start=1):
        blocks.append(f"[{i}] (source: {c.source_uri})\n{c.content}")
    return "\n\n".join(blocks) if blocks else "(no relevant context found)"


def build_messages(
    *,
    bot_system_prompt: str,
    chunks: list[RetrievedChunk],
    history: list[dict[str, str]],
    question: str,
) -> list[dict[str, str]]:
    system = _GROUNDING
    if bot_system_prompt.strip():
        system += f"\n\nAdditional instructions from the site owner:\n{bot_system_prompt.strip()}"

    context = build_context_block(chunks)
    messages: list[dict[str, str]] = [{"role": "system", "content": system}]
    messages.extend(history[-6:])  # short rolling window
    messages.append(
        {"role": "user", "content": f"Context:\n{context}\n\nQuestion: {question}"}
    )
    return messages
