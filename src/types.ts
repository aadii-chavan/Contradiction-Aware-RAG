export interface RetrievedChunk {
  id: string;
  title: string;
  date: string;
  text: string;
  /** Cosine similarity between query and chunk. */
  score: number;
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
  chunks: RetrievedChunk[];
  baseline: BaselineResult;
  aware: AwareResult;
}

export interface ServerInfo {
  retriever: string;
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
