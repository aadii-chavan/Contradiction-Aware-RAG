"""Loads data/corpus.json (owned by the Node server) and turns it into LangChain documents and chunks.

The Node app edits the corpus file; we reload whenever its mtime changes so both backends stay in sync.
"""

import hashlib
import json
import threading
from dataclasses import dataclass

from langchain_core.documents import Document
from langchain_text_splitters import RecursiveCharacterTextSplitter

from .config import CHUNK_OVERLAP, CHUNK_SIZE, CORPUS_FILE


@dataclass(frozen=True)
class CorpusSnapshot:
    version: float
    docs: list[dict]

    @property
    def by_id(self) -> dict[str, dict]:
        return {d["id"]: d for d in self.docs}


_lock = threading.Lock()
_snapshot: CorpusSnapshot | None = None

_splitter = RecursiveCharacterTextSplitter(
    chunk_size=CHUNK_SIZE,
    chunk_overlap=CHUNK_OVERLAP,
    separators=["\n\n", "\n", ". ", "; ", ", ", " "],
    keep_separator="end",
)


def snapshot() -> CorpusSnapshot:
    """Returns the current corpus, reloading it if the file changed on disk."""
    global _snapshot
    mtime = CORPUS_FILE.stat().st_mtime if CORPUS_FILE.exists() else 0.0
    with _lock:
        if _snapshot is None or _snapshot.version != mtime:
            docs = json.loads(CORPUS_FILE.read_text("utf8")) if CORPUS_FILE.exists() else []
            _snapshot = CorpusSnapshot(version=mtime, docs=docs)
        return _snapshot


def fingerprint(doc: dict) -> str:
    return hashlib.sha1(f"{doc['title']}\x00{doc['date']}\x00{doc['text']}".encode()).hexdigest()


def to_chunks(docs: list[dict]) -> list[Document]:
    """Splits each corpus document into chunks; each chunk carries its document's title as a header for context."""
    chunks: list[Document] = []
    for doc in docs:
        parts = _splitter.split_text(doc["text"]) or [doc["text"]]
        fp = fingerprint(doc)
        for i, part in enumerate(parts):
            chunks.append(
                Document(
                    id=f"{doc['id']}#{i}",
                    page_content=f"{doc['title']}\n{part.strip()}",
                    metadata={"doc_id": doc["id"], "title": doc["title"], "date": doc["date"], "chunk": i, "fingerprint": fp},
                )
            )
    return chunks
