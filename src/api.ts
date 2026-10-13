import type { EvalResult, QueryResult, ServerInfo } from './types';

async function request<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method: body === undefined ? 'GET' : 'POST',
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error ?? `Request failed (${res.status})`);
  return data as T;
}

export const fetchInfo = () => request<ServerInfo>('/api/info');
export const runQuery = (query: string) => request<QueryResult>('/api/query', { query });
export const runEvaluation = () => request<EvalResult>('/api/eval', {});
