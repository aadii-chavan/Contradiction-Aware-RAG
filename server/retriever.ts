import type { RetrievedChunk } from '../src/types';
import { getDocs, onCorpusChange } from './corpus';

export const TOP_K = 4;
export const RETRIEVER_NAME = 'tf-idf cosine';

const STOPWORDS = new Set(
  'a an and are as at be by for from has have how in is it its of on or that the this to use used uses was we what when which with does do should'.split(' '),
);

function tokenize(text: string): string[] {
  return (text.toLowerCase().match(/[a-z0-9]+(?:[-.][a-z0-9]+)*/g) ?? [])
    .flatMap((t) => (/[-.]/.test(t) ? [t, ...t.split(/[-.]/)] : [t]))
    .map((t) => (t.length > 3 && t.endsWith('s') ? t.slice(0, -1) : t))
    .filter((t) => t && !STOPWORDS.has(t));
}

type Vector = Map<string, number>;

interface Index {
  docFreq: Map<string, number>;
  size: number;
  vectors: Vector[];
}

function vectorize(tokens: string[], index: Pick<Index, 'docFreq' | 'size'>): Vector {
  const counts = new Map<string, number>();
  for (const t of tokens) counts.set(t, (counts.get(t) ?? 0) + 1);
  const vec: Vector = new Map();
  let norm = 0;
  for (const [term, count] of counts) {
    const df = index.docFreq.get(term);
    if (df === undefined) continue; // out-of-vocabulary terms carry no signal
    const w = (1 + Math.log(count)) * Math.log(1 + index.size / (1 + df));
    vec.set(term, w);
    norm += w * w;
  }
  norm = Math.sqrt(norm);
  if (norm > 0) for (const [term, w] of vec) vec.set(term, w / norm);
  return vec;
}

function buildIndex(): Index {
  const docs = getDocs();
  const docTokens = docs.map((d) => tokenize(`${d.title} ${d.text}`));
  const docFreq = new Map<string, number>();
  for (const tokens of docTokens) {
    for (const t of new Set(tokens)) docFreq.set(t, (docFreq.get(t) ?? 0) + 1);
  }
  const base = { docFreq, size: docs.length };
  return { ...base, vectors: docTokens.map((t) => vectorize(t, base)) };
}

let index = buildIndex();
onCorpusChange(() => {
  index = buildIndex();
});

function cosine(a: Vector, b: Vector): number {
  const [small, large] = a.size < b.size ? [a, b] : [b, a];
  let dot = 0;
  for (const [term, w] of small) dot += w * (large.get(term) ?? 0);
  return dot;
}

export function retrieve(query: string, k = TOP_K): RetrievedChunk[] {
  const q = vectorize(tokenize(query), index);
  const docs = getDocs();
  return docs
    .map((doc, i) => ({ doc, score: cosine(q, index.vectors[i]) }))
    .filter((r) => r.score > 0)
    .sort((x, y) => y.score - x.score)
    .slice(0, k)
    .map(({ doc, score }) => ({ ...doc, score: Math.round(score * 1000) / 1000 }));
}
