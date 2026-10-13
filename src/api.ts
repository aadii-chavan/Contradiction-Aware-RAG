import type { Doc, DocInput, EvalEvent, EvalResult, PromptSet, QueryResult, ServerInfo } from './types';

async function request<T>(path: string, body?: unknown, method = body === undefined ? 'GET' : 'POST'): Promise<T> {
  const res = await fetch(path, {
    method,
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error ?? `Request failed (${res.status})`);
  return data as T;
}

export const fetchInfo = () => request<ServerInfo>('/api/info');
export const runQuery = (query: string, prompts?: PromptSet) => request<QueryResult>('/api/query', { query, prompts });
export const fetchDefaultPrompts = () => request<PromptSet>('/api/prompts');
export const generateQuestions = (overwrite = false) =>
  request<{ generated: number }>('/api/docs/generate-prompts', { overwrite });
/** Runs the evaluation, calling `onEvent` for each streamed progress event. Resolves with the final result. */
export async function runEvaluation(onEvent: (event: EvalEvent) => void): Promise<EvalResult> {
  const res = await fetch('/api/eval', { method: 'POST' });
  if (!res.ok || !res.body) {
    const data = await res.json().catch(() => ({}));
    throw new Error((data as { error?: string }).error ?? `Request failed (${res.status})`);
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let final: EvalResult | null = null;

  const handle = (line: string) => {
    if (!line.trim()) return;
    const event = JSON.parse(line) as EvalEvent;
    if (event.type === 'error') throw new Error(event.error);
    if (event.type === 'done') final = event.result;
    onEvent(event);
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
  if (!final) throw new Error('Evaluation ended before finishing.');
  return final;
}

export const listDocs = () => request<Doc[]>('/api/docs');
export const createDoc = (doc: DocInput) => request<Doc>('/api/docs', doc);
export const updateDoc = (id: string, doc: DocInput) => request<Doc>(`/api/docs/${id}`, doc, 'PUT');
export const deleteDoc = (id: string) => request<{ ok: true }>(`/api/docs/${id}`, undefined, 'DELETE');
