"""The six workflow nodes (plus the fallback) of the contradiction-detection agent.

Each node is a plain function of the state that returns a partial update. `traced` wraps it to time it, record a
trace entry and stream live start/finish events (LangGraph custom stream) to the UI.
"""

import re
import time
from collections.abc import Callable
from functools import wraps

from langgraph.config import get_stream_writer

from ..evidence import locate, normalise
from ..llm import structured
from ..retrieval import retrieve as run_retrieval
from .state import MAX_ATTEMPTS, AgentState, ConflictAnalysis, ConflictClassification, FinalAnswer, QueryUnderstanding

CONFLICT_LABELS = {
    "direct": "Direct conflict · same parameter, incompatible values",
    "temporal": "Temporal conflict · newer note revises an older one",
}


def _context(chunks: list[dict]) -> str:
    return "\n\n".join(f"[{c['id']}] ({c['date']}) {c['title']}\n{c['text']}" for c in chunks)


def traced(name: str, router: Callable[[AgentState], str] | None = None):
    """Times a node, streams running/done/error events and appends a trace entry. Nodes return `_summary`/`_detail` keys for the UI."""

    def decorate(fn: Callable[[AgentState], dict]):
        @wraps(fn)
        def node(state: AgentState) -> dict:
            write = get_stream_writer()
            attempt = state.get("attempt", 0) + (1 if name == "retrieve" else 0)
            write({"type": "node", "node": name, "status": "running", "attempt": max(attempt, 1)})
            start = time.perf_counter()
            try:
                update = fn(state)
            except Exception as exc:
                ms = round((time.perf_counter() - start) * 1000)
                write({"type": "node", "node": name, "status": "error", "attempt": max(attempt, 1), "ms": ms, "summary": str(exc)[:300]})
                raise
            ms = round((time.perf_counter() - start) * 1000)
            summary = update.pop("_summary", "")
            detail = update.pop("_detail", None)
            route = router({**state, **update}) if router else None  # type: ignore[typeddict-item]
            write({"type": "node", "node": name, "status": "done", "attempt": max(attempt, 1), "ms": ms, "summary": summary, "detail": detail, "route": route})
            update["trace"] = [{"node": name, "attempt": max(attempt, 1), "status": "done", "ms": ms, "summary": summary}]
            return update

        return node

    return decorate


# ---------------------------------------------------------------- routers


def route_after_analysis(state: AgentState) -> str:
    return "classify" if state["analysis"]["conflict"] else "verify"


def route_after_verification(state: AgentState) -> str:
    if state["verification"]["passed"]:
        return "generate"
    return "retrieve" if state.get("attempt", 1) < MAX_ATTEMPTS else "fallback"


# ---------------------------------------------------------------- 1. query understanding

UNDERSTAND_SYSTEM = """You analyse questions about a research lab's internal notes (training configs, datasets, infrastructure, policies).
Identify what is being asked so the right notes can be found and compared. Keep the search query short and keyword-rich."""


@traced("understand")
def understand(state: AgentState) -> dict:
    query = state["query"]
    try:
        u = structured(QueryUnderstanding, UNDERSTAND_SYSTEM, f"Question: {query}").model_dump()
        note = ""
    except Exception as exc:  # degrade gracefully: the original question still drives retrieval
        u = {"intent": "answer the question", "target": query, "entities": [], "search_query": query}
        note = f" (LLM unavailable, used the raw question: {str(exc)[:80]})"
    ents = ", ".join(u["entities"]) or "none"
    return {"understanding": u, "attempt": 0, "_summary": f"Target: {u['target']} · entities: {ents}{note}", "_detail": u}


# ---------------------------------------------------------------- 2. hybrid retrieval


@traced("retrieve", router=None)
def retrieve(state: AgentState) -> dict:
    attempt = state.get("attempt", 0) + 1
    u = state.get("understanding") or {}
    if attempt == 1:
        query, k = state["query"], 4
    else:
        # Retry: broaden. Use the rewritten keyword query with entities and pull more documents, keeping earlier ones.
        query = " ".join(dict.fromkeys([u.get("search_query") or state["query"], u.get("target", ""), *u.get("entities", [])])).strip()
        k = 6
    r = run_retrieval(query, "hybrid", k=k)
    chunks = r["chunks"]
    if attempt > 1 and state.get("retrieval"):
        seen = {c["id"] for c in chunks}
        chunks = chunks + [c for c in state["retrieval"]["chunks"] if c["id"] not in seen]
    ids = ", ".join(f"{c['id']} ({c['score']:.2f})" for c in chunks)
    return {
        "attempt": attempt,
        "retrieval": {"mode": "hybrid", "query": query, "k": k, "chunks": chunks, "latencyMs": r["latencyMs"], "reranked": r.get("reranked", False)},
        "_summary": f"{'Retry with broadened query · ' if attempt > 1 else ''}{len(chunks)} docs: {ids}",
        "_detail": {"query": query, "k": k, "ids": [c["id"] for c in chunks], "scores": [c["score"] for c in chunks]},
    }


# ---------------------------------------------------------------- 3. conflict analysis

ANALYZE_SYSTEM = """You audit retrieved lab notes for contradictions about ONE target fact.
For every document that says something about the target, extract a claim with the value it states.
- "value" MUST be copied character-for-character from that document and be as short as possible (just the number or term, e.g. "3e-4", "GroupNorm", "1,000 steps"). Never paraphrase it.
- Set conflict=true only if two documents give incompatible values for the same target in the same setting. Differences in unrelated details, or documents about different models/settings, are NOT conflicts.
- If there is a conflict, conflicting_ids holds exactly the two disagreeing document IDs."""


@traced("analyze", router=route_after_analysis)
def analyze(state: AgentState) -> dict:
    u = state["understanding"]
    chunks = state["retrieval"]["chunks"]
    feedback = ""
    prev = state.get("verification")
    if prev and not prev["passed"]:
        feedback = "\n\nA previous analysis failed evidence verification:\n- " + "\n- ".join(prev["issues"]) + "\nFix these: copy values verbatim and only cite documents shown above."
    user = f"Target: {u['target']}\nQuestion: {state['query']}\n\nDocuments:\n{_context(chunks)}{feedback}"
    a = structured(ConflictAnalysis, ANALYZE_SYSTEM, user).model_dump()
    a["conflicting_ids"] = list(dict.fromkeys(a["conflicting_ids"]))[:2]
    if a["conflict"] and len(a["conflicting_ids"]) < 2:
        # A conflict needs two sources; take them from the claims if the model left the list short.
        a["conflicting_ids"] = list(dict.fromkeys([*a["conflicting_ids"], *(c["doc_id"] for c in a["claims"])]))[:2]
    summary = (
        f"Conflict suspected between {' ↔ '.join(a['conflicting_ids'])}" if a["conflict"] else f"No conflict · {len(a['claims'])} supporting claim(s)"
    )
    return {"analysis": a, "classification": {}, "_summary": summary, "_detail": a}


# ---------------------------------------------------------------- 4. conflict classification

CLASSIFY_SYSTEM = """You classify a disagreement between two lab notes.
- "temporal": the newer note revises, replaces or corrects the older one (look for words like now, changed, raised, replaced, errata, revised, and compare dates).
- "direct": both notes present their value as current and neither supersedes the other.
- "none": on closer reading they do not truly conflict (e.g. they describe different models, settings or scopes).
Name the document that should be trusted more (usually the newer revision, or the more specific scope)."""


@traced("classify")
def classify(state: AgentState) -> dict:
    a = state["analysis"]
    by_id = {c["id"]: c for c in state["retrieval"]["chunks"]}
    docs = [by_id[i] for i in a["conflicting_ids"] if i in by_id]
    claims = {c["doc_id"]: c for c in a["claims"]}
    lines = [f"[{d['id']}] dated {d['date']} — {d['title']}\n{d['text']}\nClaimed value: {claims.get(d['id'], {}).get('value', '?')}" for d in docs]
    c = structured(ConflictClassification, CLASSIFY_SYSTEM, f"Question: {state['query']}\n\n" + "\n\n".join(lines)).model_dump()

    # Deterministic guards: a temporal conflict needs different dates; default authority to the newer note.
    if c["type"] == "temporal" and len(docs) == 2 and docs[0]["date"] == docs[1]["date"]:
        c["type"], c["rationale"] = "direct", c["rationale"] + " (Same date, so treated as a direct conflict.)"
    if c["type"] == "temporal" and not c.get("authoritative_id") and len(docs) == 2:
        c["authoritative_id"] = max(docs, key=lambda d: d["date"])["id"]
    label = {"direct": "Direct conflict", "temporal": "Temporal conflict", "none": "No conflict (dismissed on review)"}[c["type"]]
    trust = f" · trust {c['authoritative_id']}" if c.get("authoritative_id") and c["type"] != "none" else ""
    return {"classification": c, "_summary": f"{label}{trust}", "_detail": c}


# ---------------------------------------------------------------- 5. evidence verification


@traced("verify", router=route_after_verification)
def verify(state: AgentState) -> dict:
    """Deterministic checks that every claim the LLM made is grounded in an exact span of a retrieved document."""
    chunks = state["retrieval"]["chunks"]
    by_id = {c["id"]: c for c in chunks}
    a = state["analysis"]
    cls = state.get("classification") or {}
    is_conflict = a["conflict"] and cls.get("type", "none") != "none"

    spans: dict[str, dict] = {}
    unverified: list[str] = []
    for claim in a["claims"]:
        doc = by_id.get(claim["doc_id"])
        span = locate(doc, claim["value"]) if doc else None
        if span and claim["doc_id"] not in spans:
            spans[claim["doc_id"]] = span
        elif not span:
            unverified.append(f"{claim['doc_id']}: “{claim['value']}” " + ("is not a retrieved document" if not doc else "does not appear verbatim in the document"))

    checks = [{"name": "Documents retrieved", "passed": bool(chunks), "detail": f"{len(chunks)} documents"}]
    issues: list[str] = []
    if is_conflict:
        pair = a["conflicting_ids"]
        pair_ok = len(pair) == 2 and all(i in spans for i in pair)
        checks.append({"name": "Both conflicting values found verbatim", "passed": pair_ok, "detail": ", ".join(f"{i}: {spans[i]['val']!r}" if i in spans else f"{i}: not found" for i in pair)})
        differ = pair_ok and normalise(spans[pair[0]]["val"]) != normalise(spans[pair[1]]["val"])
        checks.append({"name": "Values actually differ", "passed": differ, "detail": " vs ".join(spans[i]["val"] for i in pair) if pair_ok else "n/a"})
        if cls.get("type") == "temporal":
            dated = pair_ok and by_id[pair[0]]["date"] != by_id[pair[1]]["date"]
            checks.append({"name": "Temporal order is defined", "passed": dated, "detail": " vs ".join(by_id[i]["date"] for i in pair if i in by_id)})
        if not pair_ok:
            issues += [u for u in unverified if u.split(":")[0] in pair] or ["The conflicting pair could not be grounded in the retrieved documents."]
        elif not differ:
            issues.append("The two quoted values are the same, so this is not a conflict.")
    else:
        found = bool(spans)
        checks.append({"name": "Answer evidence found verbatim", "passed": found, "detail": ", ".join(f"{i}: {s['val']!r}" for i, s in spans.items()) or "no grounded claim"})
        if not found:
            issues += unverified or ["No retrieved document states the target; retrieval may have missed it."]
    if not chunks:
        issues.append("Retrieval returned nothing.")

    if state.get("simulate_failure") and state.get("attempt", 1) == 1:
        checks.append({"name": "Simulated failure (demo toggle)", "passed": False, "detail": "forced on attempt 1 to demonstrate retry"})
        issues.insert(0, "Simulated verification failure (demo toggle).")
    passed = all(c["passed"] for c in checks)
    if unverified and passed:
        checks.append({"name": "Ungrounded side claims dropped", "passed": True, "detail": "; ".join(unverified)})
    v = {"passed": passed, "checks": checks, "issues": issues, "spans": spans, "is_conflict": is_conflict}
    ok = sum(c["passed"] for c in checks)
    return {"verification": v, "_summary": f"{'Passed' if passed else 'Failed'} · {ok}/{len(checks)} checks" + ("" if passed else f" · {issues[0]}"), "_detail": {"checks": checks, "issues": issues}}


# ---------------------------------------------------------------- fallback (retries exhausted)


@traced("fallback")
def fallback(state: AgentState) -> dict:
    v = state["verification"]
    reason = v["issues"][0] if v["issues"] else "verification failed"
    note = f"Evidence could not be verified after {state.get('attempt', 1)} retrieval attempts: {reason}"
    return {"fallback": {"used": True, "reason": note}, "_summary": "Answering with only the verified evidence; result marked low confidence", "_detail": {"reason": note}}


# ---------------------------------------------------------------- 6. final answer

GENERATE_SYSTEM = """You answer questions about a research lab's internal notes using only the provided context and verified evidence.
- If a conflict is reported, state that the sources disagree, give each value with its document ID, and say which is more reliable and why (newer revision, more specific scope). Do not silently pick one.
- If no conflict is reported, answer directly.
- If evidence is marked unverified, say the notes do not clearly settle the question.
Cite document IDs in square brackets, e.g. [DOC-04]. Keep it to 2-4 sentences."""


@traced("generate")
def generate(state: AgentState) -> dict:
    v = state["verification"]
    cls = state.get("classification") or {}
    a = state["analysis"]
    fb = state.get("fallback") or {}
    spans = v["spans"]
    conflict = v["is_conflict"] and v["passed"]

    evidence = "\n".join(f"- [{i}] ({s['date']}) “{s['pre']}{s['val']}{s['post']}”" for i, s in spans.items()) or "- none"
    if conflict:
        status = f"CONFLICT ({cls['type']}): {cls['rationale']} More reliable: {cls.get('authoritative_id') or 'unclear'}."
    elif fb.get("used"):
        status = f"UNVERIFIED: {fb['reason']}"
    else:
        status = "No conflict."
    user = f"Question: {state['query']}\n\nStatus: {status}\n\nVerified evidence:\n{evidence}\n\nContext:\n{_context(state['retrieval']['chunks'])}"
    answer = structured(FinalAnswer, GENERATE_SYSTEM, user).answer.strip()

    pair = [spans[i] for i in a["conflicting_ids"] if i in spans] if conflict else []
    result = {
        "answer": answer,
        "conflict": conflict,
        "conflictKind": cls.get("type") if conflict else None,
        "conflictType": CONFLICT_LABELS.get(cls.get("type", "")) if conflict else None,
        "authoritativeId": cls.get("authoritative_id") if conflict else None,
        "pair": pair[:2],
        "cites": list(dict.fromkeys(re.findall(r"DOC-\d+", answer))),
        "confidence": "low" if fb.get("used") else "verified",
    }
    return {"result": result, "_summary": f"{'Conflict reported' if conflict else 'Direct answer'} · cites {', '.join(result['cites']) or 'none'}", "_detail": {"answer": answer}}
