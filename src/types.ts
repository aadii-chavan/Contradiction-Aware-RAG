export type RetrieverMode = 'tfidf' | 'vector' | 'hybrid';

export const RETRIEVER_LABELS: Record<RetrieverMode, string> = {
  tfidf: 'TF-IDF',
  vector: 'Vector',
  hybrid: 'Hybrid',
};

/** Per-retriever evidence for a result (present for vector / hybrid results from the Python backend). */
export interface RetrievalSignals {
  tfidf?: number;
  tfidfRank?: number;
  vector?: number;
  vectorRank?: number;
  fused?: number;
  fusedRank?: number;
  rerank?: number;
}

export interface RetrievedChunk {
  id: string;
  title: string;
  date: string;
  text: string;
  /** Retriever score: TF-IDF cosine, embedding cosine, or the hybrid fused + reranked score (0..1). */
  score: number;
  signals?: RetrievalSignals;
}

export interface Doc {
  id: string;
  title: string;
  date: string;
  text: string;
  /** A sample question this document answers, shown in the search tab. */
  prompt?: string;
}

export type DocInput = Omit<Doc, 'id'>;

export interface PromptSet {
  baseline: string;
  aware: string;
}

export interface ConflictSource {
  id: string;
  date: string;
  title: string;
  /** Excerpt split around the conflicting value so it can be highlighted. */
  pre: string;
  val: string;
  post: string;
}

export interface BaselineResult {
  answer: string;
  cites: string[];
  latencyMs: number;
}

export interface AwareResult {
  answer: string;
  conflict: boolean;
  conflictType: string | null;
  /** The two sources the model says disagree (empty when no conflict or unverifiable). */
  pair: ConflictSource[];
  latencyMs: number;
}

export interface QueryResult {
  query: string;
  retriever: RetrieverMode;
  chunks: RetrievedChunk[];
  baseline: BaselineResult;
  aware: AwareResult;
}

export interface ServerInfo {
  retriever: string;
  /** Python FastAPI backend status; null when it is not running. */
  python: { embeddingModel: string; vectorStore: string; reranker: string; ready: boolean } | null;
  model: string;
  k: number;
  documents: number;
  llmConfigured: boolean;
}

export interface EvalSide {
  detected: number;
  falseAlarms: number;
  attributed: number;
  avgLatencyMs: number;
}

export interface EvalRow {
  query: string;
  expectConflict: boolean;
  expectedIds: string[];
  baselineFlagged: boolean;
  awareFlagged: boolean;
  baselineAttributed: boolean;
  awareAttributed: boolean;
  baselineMs: number;
  awareMs: number;
}

export interface EvalResult {
  retriever: RetrieverMode;
  conflictQueries: number;
  cleanQueries: number;
  baseline: EvalSide;
  aware: EvalSide;
  rows: EvalRow[];
}

export interface EvalProgress {
  type: 'progress';
  done: number;
  total: number;
  /** The query that just finished. */
  query: string;
  /** Metrics over the rows finished so far. */
  result: EvalResult;
}

export type EvalEvent = EvalProgress | { type: 'done'; result: EvalResult } | { type: 'error'; error: string };

/* ------------------------------------------------------------------ Python backend: retrieval lab */

export interface RetrievalRun {
  mode: RetrieverMode;
  chunks: RetrievedChunk[];
  latencyMs: number;
  reranked?: boolean;
  weights?: { tfidf: number; vector: number; rerank: number };
  /** Hybrid only: every fused candidate with its per-retriever ranks and scores. */
  candidates?: (RetrievalSignals & { id: string })[];
}

export interface RetrievalComparison {
  query: string;
  results: Record<RetrieverMode, RetrievalRun>;
  /** Doc IDs returned by all three retrievers. */
  shared: string[];
}

export type BenchmarkSet = 'eval' | 'paraphrase';

export interface BenchmarkModeSummary {
  /** Queries where both seeded conflicting documents are in the top k. */
  pairRecall: number;
  /** Queries where at least one of them is. */
  anyRecall: number;
  mrr: number;
  avgLatencyMs: number;
  total: number;
}

export interface BenchmarkResult {
  set: BenchmarkSet;
  k: number;
  summary: Record<RetrieverMode, BenchmarkModeSummary>;
  rows: { query: string; expected: string[]; modes: Record<RetrieverMode, { ids: string[]; hits: number }> }[];
}

/* ------------------------------------------------------------------ Python backend: LangGraph agent */

export type AgentNodeId = 'understand' | 'retrieve' | 'analyze' | 'classify' | 'verify' | 'fallback' | 'generate';

export interface AgentNodeEvent {
  type: 'node';
  node: AgentNodeId;
  status: 'running' | 'done' | 'error';
  attempt: number;
  /** Milliseconds since the run started. */
  t: number;
  ms?: number;
  summary?: string;
  detail?: unknown;
  /** The next node chosen by a conditional edge. */
  route?: AgentNodeId | null;
}

export interface VerificationCheck {
  name: string;
  passed: boolean;
  detail: string;
}

export interface AgentClaim {
  doc_id: string;
  value: string;
  statement: string;
}

export interface AgentResult {
  answer: string;
  conflict: boolean;
  conflictKind: 'direct' | 'temporal' | null;
  conflictType: string | null;
  authoritativeId: string | null;
  pair: ConflictSource[];
  cites: string[];
  confidence: 'verified' | 'low';
}

export interface AgentFinalState {
  query: string;
  understanding: { intent: string; target: string; entities: string[]; search_query: string } | null;
  retrieval: { mode: string; query: string; k: number; chunks: RetrievedChunk[]; latencyMs: number } | null;
  analysis: { claims: AgentClaim[]; conflict: boolean; conflicting_ids: string[]; reasoning: string } | null;
  classification: { type: 'direct' | 'temporal' | 'none'; rationale: string; authoritative_id: string | null } | null;
  verification: { passed: boolean; checks: VerificationCheck[]; issues: string[]; is_conflict: boolean } | null;
  fallback: { used: boolean; reason: string } | null;
  result: AgentResult | null;
  attempts: number;
  trace: { node: AgentNodeId; attempt: number; status: string; ms: number; summary: string }[];
  totalMs: number;
}

export type AgentEvent =
  | { type: 'start'; nodes: AgentNodeId[] }
  | AgentNodeEvent
  | { type: 'done'; state: AgentFinalState }
  | { type: 'error'; error: string };
