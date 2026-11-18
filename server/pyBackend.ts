import type { RetrievedChunk, RetrieverMode } from '../src/types';

/** Client for the Python FastAPI service (LangChain + ChromaDB retrieval, LangGraph agent). */
/** Set from .env by the Vite plugin; defaults to the local uvicorn port. */
export const pyUrl = () => (process.env.PY_BACKEND_URL || 'http://127.0.0.1:8000').replace(/\/$/, '');

export interface PyHealth {
  embeddingModel: string;
  vectorStore: string;
  reranker: string;
  index: { chunks?: number };
  status: { vector: string; reranker: string; error: string | null };
}

export async function pyHealth(): Promise<PyHealth | null> {
  try {
    const res = await fetch(`${pyUrl()}/health`, { signal: AbortSignal.timeout(1500) });
    return res.ok ? ((await res.json()) as PyHealth) : null;
  } catch {
    return null;
  }
}

/** Retrieves top-k chunks from the Python backend's vector or hybrid retriever. */
export async function remoteRetrieve(query: string, mode: Exclude<RetrieverMode, 'tfidf'>, k: number): Promise<RetrievedChunk[]> {
  let res: Response;
  try {
    res = await fetch(`${pyUrl()}/retrieve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, mode, k }),
    });
  } catch {
    throw new Error(`The Python backend is not reachable at ${pyUrl()}. Start it with "npm run backend" or use the TF-IDF retriever.`);
  }
  const data = (await res.json().catch(() => ({}))) as { chunks?: RetrievedChunk[]; detail?: string };
  if (!res.ok || !data.chunks) throw new Error(`Python backend ${mode} retrieval failed: ${data.detail ?? res.status}`);
  return data.chunks;
}
