"""Cross-encoder reranking (FlashRank ms-marco MiniLM, runs locally on ONNX) as a LangChain document compressor."""

import threading
from collections.abc import Sequence

from langchain_core.callbacks import Callbacks
from langchain_core.documents import BaseDocumentCompressor, Document

from .config import MODEL_CACHE, RERANK_MODEL

_ranker = None
_lock = threading.Lock()


def _get_ranker():
    global _ranker
    with _lock:
        if _ranker is None:
            from flashrank import Ranker

            _ranker = Ranker(model_name=RERANK_MODEL, cache_dir=str(MODEL_CACHE))
        return _ranker


class CrossEncoderReranker(BaseDocumentCompressor):
    """Scores (query, passage) pairs jointly and reorders documents; adds `rerank_score` to metadata."""

    top_n: int = 4

    def compress_documents(self, documents: Sequence[Document], query: str, callbacks: Callbacks | None = None) -> Sequence[Document]:
        if not documents:
            return []
        from flashrank import RerankRequest

        passages = [{"id": i, "text": d.page_content} for i, d in enumerate(documents)]
        results = _get_ranker().rerank(RerankRequest(query=query, passages=passages))
        out = []
        for r in results[: self.top_n]:
            doc = documents[int(r["id"])]
            out.append(Document(page_content=doc.page_content, metadata={**doc.metadata, "rerank_score": float(r["score"])}, id=doc.id))
        return out


def warm_up() -> None:
    _get_ranker()
