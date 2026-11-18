"""Persistent ChromaDB vector store over the corpus chunks, embedded with Gemini via LangChain.

Sync is incremental: each chunk stores its document's fingerprint, so after an edit in the Documents page only
changed documents are re-embedded. Vectors persist in backend/.chroma across restarts.
"""

import re
import threading
from collections import OrderedDict

from langchain_chroma import Chroma
from langchain_google_genai import GoogleGenerativeAIEmbeddings

from .config import CHROMA_DIR, EMBEDDING_DIM, EMBEDDING_MODEL, GEMINI_API_KEY
from .corpus import CorpusSnapshot, to_chunks


class CachedQueryEmbeddings(GoogleGenerativeAIEmbeddings):
    """Gemini embeddings with a small LRU cache for repeated queries (the demo and benchmark reuse them)."""

    def embed_query(self, text: str, **kwargs) -> list[float]:  # type: ignore[override]
        cache: OrderedDict = _query_cache
        if text in cache:
            cache.move_to_end(text)
            return cache[text]
        vec = super().embed_query(text, **kwargs)
        cache[text] = vec
        if len(cache) > 512:
            cache.popitem(last=False)
        return vec


_query_cache: OrderedDict[str, list[float]] = OrderedDict()


class VectorIndex:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._synced_version: float | None = None
        self._store: Chroma | None = None
        self.last_sync: dict = {}

    @property
    def collection_name(self) -> str:
        return "corpus_" + re.sub(r"[^a-zA-Z0-9]+", "_", EMBEDDING_MODEL) + f"_{EMBEDDING_DIM}"

    def store(self) -> Chroma:
        if self._store is None:
            if not GEMINI_API_KEY:
                raise RuntimeError("GEMINI_API_KEY is not set; vector search needs it for embeddings.")
            embeddings = CachedQueryEmbeddings(
                model=EMBEDDING_MODEL,
                google_api_key=GEMINI_API_KEY,
                output_dimensionality=EMBEDDING_DIM,
            )
            self._store = Chroma(
                collection_name=self.collection_name,
                embedding_function=embeddings,
                persist_directory=str(CHROMA_DIR),
                collection_metadata={"hnsw:space": "cosine"},
            )
        return self._store

    def sync(self, snap: CorpusSnapshot) -> dict:
        """Brings the collection in line with the corpus. Cheap when nothing changed."""
        with self._lock:
            if self._synced_version == snap.version:
                return self.last_sync
            store = self.store()
            chunks = to_chunks(snap.docs)
            wanted = {c.id: c for c in chunks}
            existing = store.get(include=["metadatas"])
            have = {i: (m or {}).get("fingerprint") for i, m in zip(existing["ids"], existing["metadatas"])}

            stale = [i for i, fp in have.items() if i not in wanted or wanted[i].metadata["fingerprint"] != fp]
            missing = [c for i, c in wanted.items() if i not in have or i in stale]
            if stale:
                store.delete(ids=stale)
            if missing:
                store.add_documents(missing, ids=[c.id for c in missing])

            self._synced_version = snap.version
            self.last_sync = {
                "chunks": len(chunks),
                "documents": len(snap.docs),
                "embedded": len(missing),
                "removed": len([i for i in stale if i not in wanted]),
                "collection": self.collection_name,
            }
            return self.last_sync

    def search(self, snap: CorpusSnapshot, query: str, k: int) -> list[tuple[dict, float]]:
        """Top-k documents by cosine similarity; a document scores as its best-matching chunk."""
        self.sync(snap)
        hits = self.store().similarity_search_with_score(query, k=k * 3)
        by_id = snap.by_id
        best: dict[str, float] = {}
        for chunk, distance in hits:
            doc_id = chunk.metadata["doc_id"]
            sim = 1.0 - float(distance)  # cosine distance -> similarity
            if doc_id in by_id and sim > best.get(doc_id, -1.0):
                best[doc_id] = sim
        ranked = sorted(best.items(), key=lambda x: -x[1])[:k]
        return [(by_id[i], s) for i, s in ranked]


vector_index = VectorIndex()
