import type {
  AgentEvent,
  AgentFinalState,
  BenchmarkResult,
  BenchmarkSet,
  Doc,
  DocInput,
  EvalEvent,
  EvalResult,
  PromptSet,
  QueryResult,
  RetrievalComparison,
  RetrieverMode,
  ServerInfo,
} from './types';

async function request<T>(path: string, body?: unknown, method = body === undefined ? 'GET' : 'POST'): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      method,
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new Error('Network error: is the dev server running?');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(errorMessage(path, res.status, data));
  return data as T;
}

/** Node errors use `error`, FastAPI uses `detail`; a 5xx with no body on /py means the proxy could not reach Python. */
function errorMessage(path: string, status: number, data: unknown): string {
  const d = data as { error?: string; detail?: unknown };
  if (d.error) return d.error;
  if (typeof d.detail === 'string') return d.detail;
  if (Array.isArray(d.detail)) return d.detail.map((x: { msg?: string }) => x.msg).join('; ');
  if (path.startsWith('/py/') && status >= 500) return 'The Python backend is not running. Start it with "npm run backend" (see README).';
  return `Request failed (${status})`;
}

/** Reads a newline-delimited JSON stream, calling `onLine` for each parsed object. */
async function readNdjson<E>(res: Response, path: string, onLine: (event: E) => void): Promise<void> {
  if (!res.ok || !res.body) {
    const data = await res.json().catch(() => ({}));
    throw new Error(errorMessage(path, res.status, data));
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  const handle = (line: string) => {
    if (line.trim()) onLine(JSON.parse(line) as E);
  };
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    lines.forEach(handle);
  }
  handle(buffer);
}

export const fetchInfo = () => request<ServerInfo>('/api/info');
export const runQuery = (query: string, prompts?: PromptSet, retriever: RetrieverMode = 'tfidf') =>
  request<QueryResult>('/api/query', { query, prompts, retriever });
export const fetchDefaultPrompts = () => request<PromptSet>('/api/prompts');
export const generateQuestions = (overwrite = false) =>
  request<{ generated: number }>('/api/docs/generate-prompts', { overwrite });

/** Runs the evaluation, calling `onEvent` for each streamed progress event. Resolves with the final result. */
export async function runEvaluation(onEvent: (event: EvalEvent) => void, retriever: RetrieverMode = 'tfidf'): Promise<EvalResult> {
  const res = await fetch('/api/eval', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ retriever }),
  });
  let final: EvalResult | null = null;
  await readNdjson<EvalEvent>(res, '/api/eval', (event) => {
    if (event.type === 'error') throw new Error(event.error);
    if (event.type === 'done') final = event.result;
    onEvent(event);
  });
  if (!final) throw new Error('Evaluation ended before finishing.');
  return final;
}

export const listDocs = () => request<Doc[]>('/api/docs');
export const createDoc = (doc: DocInput) => request<Doc>('/api/docs', doc);
export const updateDoc = (id: string, doc: DocInput) => request<Doc>(`/api/docs/${id}`, doc, 'PUT');
export const deleteDoc = (id: string) => request<{ ok: true }>(`/api/docs/${id}`, undefined, 'DELETE');

/* ---------------------------------------------------------------- Python backend (via the /py proxy) */

export const compareRetrievers = (query: string, rerank = true) =>
  request<RetrievalComparison>('/py/retrieve/compare', { query, rerank });

export const runRetrievalBenchmark = (set: BenchmarkSet) => request<BenchmarkResult>('/py/retrieve/benchmark', { set });

/** Streams a LangGraph run; resolves with the final state. */
export async function runAgent(query: string, simulateFailure: boolean, onEvent: (event: AgentEvent) => void): Promise<AgentFinalState> {
  let res: Response;
  try {
    res = await fetch('/py/agent/stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, simulate_failure: simulateFailure }),
    });
  } catch {
    throw new Error('Network error: is the dev server running?');
  }
  let final: AgentFinalState | null = null;
  await readNdjson<AgentEvent>(res, '/py/agent/stream', (event) => {
    onEvent(event);
    if (event.type === 'error') throw new Error(event.error);
    if (event.type === 'done') final = event.state;
  });
  if (!final) throw new Error('The workflow ended before finishing.');
  return final;
}
