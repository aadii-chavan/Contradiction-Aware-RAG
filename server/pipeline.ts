import type { PromptSet, AwareResult, BaselineResult, ConflictSource, QueryResult, RetrievedChunk } from '../src/types';
import { chat, type LlmConfig } from './llm';
import { AWARE_SYSTEM, BASELINE_SYSTEM, userPrompt } from './prompts';
import { retrieve } from './retriever';

const CONFLICT_LABELS: Record<string, string> = {
  direct: 'Direct conflict · same parameter, incompatible values',
  temporal: 'Temporal conflict · newer note revises an older one',
};

async function timed<T>(fn: () => Promise<T>): Promise<[T, number]> {
  const start = performance.now();
  const value = await fn();
  return [value, Math.round(performance.now() - start)];
}

async function runBaseline(cfg: LlmConfig, query: string, chunks: RetrievedChunk[], system: string): Promise<BaselineResult> {
  const [answer, latencyMs] = await timed(() => chat(cfg, system, userPrompt(query, chunks)));
  const cites = [...new Set(answer.match(/DOC-\d+/g) ?? [])];
  return { answer, cites, latencyMs };
}

interface RawAware {
  conflict?: boolean;
  conflict_type?: string | null;
  conflicting?: { id?: string; value?: string }[];
  answer?: string;
}

function parseJson(raw: string): RawAware | null {
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(raw.slice(start, end + 1)) as RawAware;
  } catch {
    return null;
  }
}

/** Locates `value` in the chunk and returns the surrounding sentence split around it. */
function toSource(chunk: RetrievedChunk, value: string): ConflictSource | null {
  const idx = chunk.text.toLowerCase().indexOf(value.toLowerCase());
  if (idx < 0 || !value.trim()) return null;
  const end = idx + value.length;
  const sentenceStart = chunk.text.lastIndexOf('. ', idx);
  const from = sentenceStart < 0 ? 0 : sentenceStart + 2;
  const sentenceEnd = chunk.text.indexOf('. ', end);
  const to = sentenceEnd < 0 ? chunk.text.length : sentenceEnd + 1;
  return {
    id: chunk.id,
    date: chunk.date,
    title: chunk.title,
    pre: chunk.text.slice(from, idx),
    val: chunk.text.slice(idx, end),
    post: chunk.text.slice(end, to),
  };
}

async function runAware(cfg: LlmConfig, query: string, chunks: RetrievedChunk[], system: string): Promise<AwareResult> {
  const [raw, latencyMs] = await timed(() => chat(cfg, system, userPrompt(query, chunks), { json: true }));
  const parsed = parseJson(raw);
  if (!parsed) {
    // Model ignored the JSON format; surface its text rather than failing the request.
    return { answer: raw, conflict: false, conflictType: null, pair: [], latencyMs };
  }

  const byId = new Map(chunks.map((c) => [c.id, c]));
  const pair: ConflictSource[] = [];
  for (const item of parsed.conflicting ?? []) {
    const chunk = item.id ? byId.get(item.id) : undefined;
    const source = chunk && item.value ? toSource(chunk, item.value) : null;
    if (source && !pair.some((p) => p.id === source.id)) pair.push(source);
  }

  const conflict = parsed.conflict === true;
  const type = parsed.conflict_type ?? null;
  return {
    answer: parsed.answer?.trim() || raw,
    conflict,
    conflictType: conflict ? (type && CONFLICT_LABELS[type]) || 'Conflict · sources disagree' : null,
    pair: conflict ? pair.slice(0, 2) : [],
    latencyMs,
  };
}

export async function runQuery(cfg: LlmConfig, query: string, prompts: Partial<PromptSet> = {}): Promise<QueryResult> {
  const chunks = retrieve(query);
  if (chunks.length === 0) throw new Error('No documents matched this query.');
  const [baseline, aware] = await Promise.all([runBaseline(cfg, query, chunks, prompts.baseline?.trim() || BASELINE_SYSTEM),
    runAware(cfg, query, chunks, prompts.aware?.trim() || AWARE_SYSTEM),]);
  return { query, chunks, baseline, aware };
}
