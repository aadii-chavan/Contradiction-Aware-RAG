"""Exact-span evidence: locate a quoted value inside a document and split its sentence around it (port of toSource in server/pipeline.ts)."""

import re


def locate(doc: dict, value: str) -> dict | None:
    text = doc["text"]
    value = (value or "").strip()
    if not value:
        return None
    # Prefer a whole-token match so "4" matches "4 GPUs", not the 4 in "40 GB"; fall back to any substring.
    m = re.search(rf"(?<![A-Za-z0-9]){re.escape(value)}(?![A-Za-z0-9])", text, re.IGNORECASE)
    idx = m.start() if m else text.lower().find(value.lower())
    if idx < 0:
        return None
    end = idx + len(value)
    sentence_start = text.rfind(". ", 0, idx)
    start = 0 if sentence_start < 0 else sentence_start + 2
    sentence_end = text.find(". ", end)
    stop = len(text) if sentence_end < 0 else sentence_end + 1
    return {
        "id": doc["id"],
        "date": doc["date"],
        "title": doc["title"],
        "pre": text[start:idx],
        "val": text[idx:end],
        "post": text[end:stop],
    }


def normalise(value: str) -> str:
    return "".join(ch for ch in value.lower() if ch.isalnum() or ch in ".-/")
