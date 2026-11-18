"""Python port of server/retriever.ts so all three retrievers can be compared side by side.

Same tokenizer, weighting ((1 + ln tf) * ln(1 + N / (1 + df))) and L2-normalised cosine, so scores match the Node retriever.
"""

import math
import re
import threading

from .corpus import CorpusSnapshot

STOPWORDS = set(
    "a an and are as at be by for from has have how in is it its of on or that the this to use used uses was we what when which with does do should".split()
)
_TOKEN = re.compile(r"[a-z0-9]+(?:[-.][a-z0-9]+)*")


def tokenize(text: str) -> list[str]:
    out: list[str] = []
    for t in _TOKEN.findall(text.lower()):
        parts = [t, *re.split(r"[-.]", t)] if re.search(r"[-.]", t) else [t]
        for p in parts:
            p = p[:-1] if len(p) > 3 and p.endswith("s") else p
            if p and p not in STOPWORDS:
                out.append(p)
    return out


def _vectorize(tokens: list[str], doc_freq: dict[str, int], size: int) -> dict[str, float]:
    counts: dict[str, int] = {}
    for t in tokens:
        counts[t] = counts.get(t, 0) + 1
    vec: dict[str, float] = {}
    norm = 0.0
    for term, count in counts.items():
        df = doc_freq.get(term)
        if df is None:
            continue
        w = (1 + math.log(count)) * math.log(1 + size / (1 + df))
        vec[term] = w
        norm += w * w
    norm = math.sqrt(norm)
    if norm > 0:
        vec = {k: v / norm for k, v in vec.items()}
    return vec


class TfidfIndex:
    def __init__(self, snap: CorpusSnapshot):
        self.version = snap.version
        self.docs = snap.docs
        doc_tokens = [tokenize(f"{d['title']} {d['text']}") for d in snap.docs]
        self.doc_freq: dict[str, int] = {}
        for tokens in doc_tokens:
            for t in set(tokens):
                self.doc_freq[t] = self.doc_freq.get(t, 0) + 1
        self.vectors = [_vectorize(t, self.doc_freq, len(snap.docs)) for t in doc_tokens]

    def search(self, query: str, k: int) -> list[tuple[dict, float]]:
        q = _vectorize(tokenize(query), self.doc_freq, len(self.docs))
        scored = []
        for doc, vec in zip(self.docs, self.vectors):
            small, large = (q, vec) if len(q) < len(vec) else (vec, q)
            score = sum(w * large.get(t, 0.0) for t, w in small.items())
            if score > 0:
                scored.append((doc, score))
        scored.sort(key=lambda x: -x[1])
        return scored[:k]


_index: TfidfIndex | None = None
_lock = threading.Lock()


def get_index(snap: CorpusSnapshot) -> TfidfIndex:
    global _index
    with _lock:
        if _index is None or _index.version != snap.version:
            _index = TfidfIndex(snap)
        return _index
