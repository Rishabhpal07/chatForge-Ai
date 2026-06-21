"""Grounded prompt construction for RAG answers."""
from __future__ import annotations

from app.db.vectors import RetrievedChunk

_GROUNDING = (
    "You are a helpful assistant for a specific website. Answer the user's question "
    "using ONLY the context below. If the answer is not in the context, do not invent "
    "facts — instead say you couldn't find that in the indexed pages, note it may be on a "
    "page that hasn't been added yet, and offer to help with something else. Do NOT include any "
    "reference markers, citation numbers, or bracketed numbers like [1] or [2] in your "
    "reply — write a clean answer with no source markers.\n\n"
    "Be concise and direct. Answer in 1–3 short sentences (or a few bullets only if the "
    "user explicitly asks for a list). Give only what directly answers the question — no "
    "preamble, no restating the question, no background or filler, no repetition. If a "
    "short answer fully covers it, stop there.\n\n"
    "Follow-ups refer to the earlier conversation. 'In one word' = a single word; but "
    "'in simple words', 'explain simply', 'ELI5', or 'in detail' mean rephrase the SAME "
    "topic accordingly — a plain one- or two-sentence explanation for 'simple', a fuller "
    "explanation for 'in detail'. Never reply with a single word unless explicitly asked.\n\n"
    "Write in clean, natural prose. Use markdown sparingly: bold only a genuinely key term, "
    "a simple dash list only when listing 3+ items, and avoid headings, nested bullets, and "
    "decorative asterisks. Plain sentences are preferred over heavily formatted text."
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
