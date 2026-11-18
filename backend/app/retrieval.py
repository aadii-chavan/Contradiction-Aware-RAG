"""TF-IDF, vector and hybrid retrieval behind one interface.

Hybrid retrieval:
  1. Candidate pools: top-10 from TF-IDF and top-10 from the Chroma vector store.
  2. Score fusion: each retriever's scores are min-max normalised over the pool, then combined as
     0.3 * tfidf + 0.7 * vector (a document missing from a list scores 0 for it).
  3. Reranking: a cross-encoder scores every (query, document) pair and is blended in with weight 0.3.

The weights were chosen on the 20 seeded-conflict queries plus 20 paraphrases of them (data/paraphraseSet.json):
plain Reciprocal Rank Fusion kept both conflicting documents in the top 4 for only 12/20 paraphrases, and letting
the MS-MARCO cross-encoder reorder on its own dropped that to 10/20, while this blend keeps 19/20 on both sets.
Every result keeps its per-retriever ranks and scores so the UI can show why a document landed where it did.
"""
import time
from typing import Literal

from langchain_core.documents import Document

from .config import TOP_K
from .corpus import snapshot
from .rerank import CrossEncoderReranker
from .tfidf import get_index
from .vectorstore import vector_index

Mode = Literal["tfidf", "vector", "hybrid"]
MODES: tuple[Mode, ...] = ("tfidf", "vector", "hybrid")

CANDIDATES = 10
WEIGHTS = {"tfidf": 0.3, "vector": 0.7}
RERANK_WEIGHT = 0.3


def _r(x: float) -> float:
    return round(x, 3)


def _result(doc: dict, score: float, **signals) -> dict:
    return {"id": doc["id"], "title": doc["title"], "date": doc["date"], "text": doc["text"], "score": _r(score), "signals": signals}


def retrieve(query: str, mode: Mode = "hybrid", k: int = TOP_K, rerank: bool = True) -> dict:
    """Returns {mode, chunks, latencyMs, candidates?}. Chunks match the frontend's RetrievedChunk shape (+ signals)."""
    snap = snapshot()
    start = time.perf_counter()

    if mode == "tfidf":
        chunks = [_result(d, s, tfidf=_r(s), tfidfRank=i + 1) for i, (d, s) in enumerate(get_index(snap).search(query, k))]
        return {"mode": mode, "chunks": chunks, "latencyMs": round((time.perf_counter() - start) * 1000, 1)}

    if mode == "vector":
        chunks = [_result(d, s, vector=_r(s), vectorRank=i + 1) for i, (d, s) in enumerate(vector_index.search(snap, query, k))]
        return {"mode": mode, "chunks": chunks, "latencyMs": round((time.perf_counter() - start) * 1000, 1)}

    if mode != "hybrid":
        raise ValueError(f"Unknown retrieval mode: {mode}")

    # 1) Candidate pools from both retrievers.
    lexical = get_index(snap).search(query, CANDIDATES)
    semantic = vector_index.search(snap, query, CANDIDATES)

    # 2) Min-max normalise each list over its candidates, then fuse with fixed weights.
    pool: dict[str, dict] = {}
    for name, ranked in (("tfidf", lexical), ("vector", semantic)):
        scores = [s for _, s in ranked]
        lo, hi = (min(scores), max(scores)) if scores else (0.0, 0.0)
        for rank, (doc, score) in enumerate(ranked, start=1):
            entry = pool.setdefault(doc["id"], {"doc": doc, "fused": 0.0})
            entry["fused"] += WEIGHTS[name] * ((score - lo) / (hi - lo) if hi > lo else 1.0)
            entry[name] = _r(score)
            entry[f"{name}Rank"] = rank
    fused = sorted(pool.values(), key=lambda e: -e["fused"])
    for i, e in enumerate(fused, start=1):
        e["fusedRank"] = i

    def signals(e: dict) -> dict:
        return {key: e[key] for key in ("tfidf", "tfidfRank", "vector", "vectorRank", "fusedRank") if key in e} | {"fused": _r(e["fused"])}

    # 3) Cross-encoder rerank of the whole pool, blended with the fused score.
    reranked = False
    chunks: list[dict] = []
    if rerank and fused:
        try:
            candidates = [
                Document(page_content=f"{e['doc']['title']}. {e['doc']['text']}", metadata={"doc_id": e["doc"]["id"]})
                for e in fused
            ]
            ordered = CrossEncoderReranker(top_n=len(candidates)).compress_documents(candidates, query)
            rr = {d.metadata["doc_id"]: d.metadata["rerank_score"] for d in ordered}
            for e in fused:
                e["rerank"] = rr.get(e["doc"]["id"], 0.0)
                e["final"] = (e["fused"] + RERANK_WEIGHT * e["rerank"]) / (1 + RERANK_WEIGHT)
            final = sorted(fused, key=lambda e: -e["final"])[:k]
            chunks = [_result(e["doc"], e["final"], **signals(e), rerank=_r(e["rerank"])) for e in final]
            reranked = True
        except Exception as exc:  # reranker unavailable (e.g. model download failed): keep the fused order
            print(f"[retrieval] rerank failed, using fused order: {exc}")
    if not reranked:
        chunks = [_result(e["doc"], e["fused"], **signals(e)) for e in fused[:k]]

    return {
        "mode": mode,
        "reranked": reranked,
        "chunks": chunks,
        "weights": {**WEIGHTS, "rerank": RERANK_WEIGHT if reranked else 0.0},
        "candidates": [{"id": e["doc"]["id"], **signals(e), **({"rerank": _r(e["rerank"])} if "rerank" in e else {})} for e in fused],
        "latencyMs": round((time.perf_counter() - start) * 1000, 1),
    }
