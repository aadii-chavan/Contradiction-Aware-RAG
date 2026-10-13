import type { IncomingMessage, ServerResponse } from 'node:http';
import { loadEnv, type Plugin } from 'vite';
import { createDoc, deleteDoc, getDocs, updateDoc, type DocInput } from './corpus';
import { EVAL_TOTAL, runEvaluation, summarize } from './evaluate';
import { isConfigured, llmConfigFromEnv, type LlmConfig } from './llm';
import { runQuery } from './pipeline';
import { generateQuestions } from './promptGen';
import { DEFAULT_PROMPTS } from './prompts';
import { RETRIEVER_NAME, TOP_K } from './retriever';
import type { EvalEvent, PromptSet, ServerInfo } from '../src/types';

type Next = () => void;

function send(res: ServerResponse, status: number, body: unknown) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(body));
}

async function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  const raw = Buffer.concat(chunks).toString('utf8');
  return raw ? JSON.parse(raw) : {};
}

function makeHandler(cfg: LlmConfig) {
  return async (req: IncomingMessage, res: ServerResponse, next: Next) => {
    const path = (req.url ?? '').split('?')[0];
    try {
      if (req.method === 'GET' && path === '/api/info') {
        const info: ServerInfo = {
          retriever: RETRIEVER_NAME,
          model: cfg.model,
          k: TOP_K,
          documents: getDocs().length,
          llmConfigured: isConfigured(cfg),
        };
        return send(res, 200, info);
      }
      if (req.method === 'GET' && path === '/api/prompts') return send(res, 200, DEFAULT_PROMPTS());
      if (req.method === 'POST' && path === '/api/docs/generate-prompts') {
        const { overwrite } = await readJson(req);
        return send(res, 200, { generated: await generateQuestions(cfg, overwrite === true) });
      }
      if (path === '/api/docs' || path.startsWith('/api/docs/')) {
        const id = decodeURIComponent(path.slice('/api/docs/'.length));
        if (req.method === 'GET' && path === '/api/docs') return send(res, 200, getDocs());
        if (req.method === 'POST' && path === '/api/docs') return send(res, 201, createDoc((await readJson(req)) as unknown as DocInput));
        if (req.method === 'PUT' && id) return send(res, 200, updateDoc(id, (await readJson(req)) as unknown as DocInput));
        if (req.method === 'DELETE' && id) {
          deleteDoc(id);
          return send(res, 200, { ok: true });
        }
      }
      if (req.method === 'POST' && path === '/api/query') {
        const { query, prompts } = await readJson(req);
        if (typeof query !== 'string' || !query.trim()) return send(res, 400, { error: 'Query is required.' });
        return send(res, 200, await runQuery(cfg, query.trim(), (prompts ?? {}) as Partial<PromptSet>));
      }
      if (req.method === 'POST' && path === '/api/eval') {
        // Stream newline-delimited JSON so the UI can show live progress.
        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/x-ndjson');
        res.setHeader('Cache-Control', 'no-cache');
        const emit = (event: EvalEvent) => res.write(JSON.stringify(event) + '\n');
        try {
          const result = await runEvaluation(cfg, (rows, query) =>
            emit({ type: 'progress', done: rows.length, total: EVAL_TOTAL, query, result: summarize(rows) }),
          );
          emit({ type: 'done', result });
        } catch (err) {
          emit({ type: 'error', error: err instanceof Error ? err.message : String(err) });
        }
        return res.end();
      }
    } catch (err) {
      const status = path.startsWith('/api/docs') ? 400 : 500;
      return send(res, status, { error: err instanceof Error ? err.message : String(err) });
    }
    next();
  };
}

/** Serves the RAG API from the Vite dev/preview server so one `npm run dev` runs everything. */
export function ragApi(): Plugin {
  let cfg: LlmConfig;
  return {
    name: 'rag-api',
    config(_, { mode }) {
      cfg = llmConfigFromEnv(loadEnv(mode, process.cwd(), ''));
    },
    configureServer(server) {
      server.middlewares.use(makeHandler(cfg));
    },
    configurePreviewServer(server) {
      server.middlewares.use(makeHandler(cfg));
    },
  };
}
