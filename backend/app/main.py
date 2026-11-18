"""FastAPI service for LangChain retrieval (TF-IDF / Chroma vector / hybrid + rerank) and the LangGraph agent.

The React app reaches it through the Vite proxy at /py/*; the Node API also calls /retrieve when the Search tab
or the evaluation uses the vector or hybrid retriever.
"""

import asyncio
import json
import threading
import time
from contextlib import asynccontextmanager
from typing import Literal

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from . import config
from .agent.graph import NODE_ORDER, build_graph
from .corpus import snapshot
from .rerank import warm_up
from .retrieval import MODES, Mode, retrieve
from .vectorstore import _query_cache, vector_index

_status: dict = {"vector": "starting", "reranker": "starting", "error": None}


def _warm() -> None:
    try:
        vector_index.sync(snapshot())
        _status["vector"] = "ready"
    except Exception as exc:
        _status["vector"], _status["error"] = "error", str(exc)
    try:
        warm_up()
        _status["reranker"] = "ready"
    except Exception as exc:
        _status["reranker"], _status["error"] = "error", str(exc)


@asynccontextmanager
async def lifespan(_: FastAPI):
    threading.Thread(target=_warm, daemon=True).start()  # embed the corpus and load the reranker without blocking startup
    yield


app = FastAPI(title="Contradiction-Aware RAG backend", version="1.0", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"], allow_methods=["*"], allow_headers=["*"])


def _fail(exc: Exception) -> HTTPException:
    return HTTPException(status_code=500, detail=str(exc))


@app.get("/health")
def health() -> dict:
    snap = snapshot()
    return {
        "ok": True,
        "documents": len(snap.docs),
        "llm": config.GEMINI_MODEL,
        "llmConfigured": bool(config.GEMINI_API_KEY),
        "embeddingModel": f"{config.EMBEDDING_MODEL} ({config.EMBEDDING_DIM}d)",
        "vectorStore": "ChromaDB (persistent)",
        "reranker": config.RERANK_MODEL,
        "status": _status,
        "index": vector_index.last_sync,
    }


@app.post("/index/sync")
def sync_index() -> dict:
    try:
        return vector_index.sync(snapshot())
    except Exception as exc:
        raise _fail(exc)


# ---------------------------------------------------------------- retrieval


class RetrieveBody(BaseModel):
    query: str = Field(min_length=1)
    mode: Mode = "hybrid"
    k: int = Field(default=config.TOP_K, ge=1, le=20)
    rerank: bool = True


@app.post("/retrieve")
def retrieve_endpoint(body: RetrieveBody) -> dict:
    try:
        return retrieve(body.query.strip(), body.mode, body.k, body.rerank)
    except Exception as exc:
        raise _fail(exc)


class CompareBody(BaseModel):
    query: str = Field(min_length=1)
    k: int = Field(default=config.TOP_K, ge=1, le=20)
    rerank: bool = True


@app.post("/retrieve/compare")
def compare(body: CompareBody) -> dict:
    """Runs all three retrievers on the same query (Demo 1)."""
    q = body.query.strip()
    try:
        results = {m: retrieve(q, m, body.k, body.rerank) for m in MODES}
    except Exception as exc:
        raise _fail(exc)
    ids = {m: [c["id"] for c in r["chunks"]] for m, r in results.items()}
    everywhere = set(ids["tfidf"]) & set(ids["vector"]) & set(ids["hybrid"])
    return {"query": q, "results": results, "shared": sorted(everywhere)}


class BenchmarkBody(BaseModel):
    set: Literal["eval", "paraphrase"] = "eval"
    k: int = Field(default=config.TOP_K, ge=1, le=20)


def _prefetch_query_embeddings(queries: list[str]) -> None:
    """One batched embedding call for every benchmark query instead of one call each."""
    todo = [q for q in queries if q not in _query_cache]
    if not todo:
        return
    emb = vector_index.store().embeddings
    vectors = emb.embed_documents(todo, task_type="RETRIEVAL_QUERY")  # type: ignore[union-attr, call-arg]
    for q, v in zip(todo, vectors):
        _query_cache[q] = v


@app.post("/retrieve/benchmark")
def benchmark(body: BenchmarkBody) -> dict:
    """Retrieval-only metrics over the labelled conflict queries: does each retriever surface BOTH conflicting documents?"""
    path = config.EVAL_FILE if body.set == "eval" else config.EVAL_FILE.with_name("paraphraseSet.json")
    cases = [c for c in json.loads(path.read_text("utf8")) if c["conflictIds"]]
    try:
        _prefetch_query_embeddings([c["query"] for c in cases])
        summary: dict[str, dict] = {}
        rows = [{"query": c["query"], "expected": c["conflictIds"], "modes": {}} for c in cases]
        for mode in MODES:
            pair = anyhit = 0
            rr_sum = 0.0
            ms: list[float] = []
            for row, c in zip(rows, cases):
                r = retrieve(c["query"], mode, body.k)
                got = [x["id"] for x in r["chunks"]]
                hits = [i for i in c["conflictIds"] if i in got]
                first = min((got.index(i) + 1 for i in hits), default=0)
                pair += len(hits) == len(c["conflictIds"])
                anyhit += bool(hits)
                rr_sum += 1 / first if first else 0
                ms.append(r["latencyMs"])
                row["modes"][mode] = {"ids": got, "hits": len(hits)}
            n = len(cases)
            summary[mode] = {"pairRecall": pair, "anyRecall": anyhit, "mrr": round(rr_sum / n, 3), "avgLatencyMs": round(sum(ms) / n, 1), "total": n}
        return {"set": body.set, "k": body.k, "summary": summary, "rows": rows}
    except Exception as exc:
        raise _fail(exc)


# ---------------------------------------------------------------- agent


class AgentBody(BaseModel):
    query: str = Field(min_length=1)
    simulate_failure: bool = False


def _final(state: dict, ms: int) -> dict:
    return {
        "query": state.get("query"),
        "understanding": state.get("understanding"),
        "retrieval": state.get("retrieval"),
        "analysis": state.get("analysis"),
        "classification": state.get("classification") or None,
        "verification": {k: v for k, v in (state.get("verification") or {}).items() if k != "spans"} or None,
        "fallback": state.get("fallback"),
        "result": state.get("result"),
        "attempts": state.get("attempt", 0),
        "trace": state.get("trace", []),
        "totalMs": ms,
    }


@app.get("/agent/graph")
def agent_graph() -> dict:
    g = build_graph().get_graph()
    edges = [{"source": e.source, "target": e.target, "conditional": e.conditional} for e in g.edges]
    return {"nodes": NODE_ORDER, "edges": edges, "mermaid": g.draw_mermaid()}


@app.post("/agent/run")
async def agent_run(body: AgentBody) -> dict:
    start = time.perf_counter()
    try:
        state = await build_graph().ainvoke({"query": body.query.strip(), "simulate_failure": body.simulate_failure})
    except Exception as exc:
        raise _fail(exc)
    return _final(state, round((time.perf_counter() - start) * 1000))


@app.post("/agent/stream")
async def agent_stream(body: AgentBody) -> StreamingResponse:
    """Streams newline-delimited JSON: one event per node start/finish, then the final state."""

    async def events():
        start = time.perf_counter()
        last: dict = {}
        yield json.dumps({"type": "start", "nodes": NODE_ORDER}) + "\n"
        try:
            inputs = {"query": body.query.strip(), "simulate_failure": body.simulate_failure}
            async for mode, chunk in build_graph().astream(inputs, stream_mode=["custom", "values"]):
                if mode == "custom":
                    yield json.dumps({**chunk, "t": round((time.perf_counter() - start) * 1000)}) + "\n"
                else:
                    last = chunk
                await asyncio.sleep(0)
            yield json.dumps({"type": "done", "state": _final(last, round((time.perf_counter() - start) * 1000))}) + "\n"
        except Exception as exc:
            yield json.dumps({"type": "error", "error": str(exc)[:500]}) + "\n"

    return StreamingResponse(events(), media_type="application/x-ndjson", headers={"Cache-Control": "no-cache"})
