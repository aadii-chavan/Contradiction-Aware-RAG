import type { IncomingMessage, ServerResponse } from 'node:http';
import { loadEnv, type Plugin } from 'vite';
import { CORPUS } from './corpus';
import { runEvaluation } from './evaluate';
import { isConfigured, llmConfigFromEnv, type LlmConfig } from './llm';
import { runQuery } from './pipeline';
import { RETRIEVER_NAME, TOP_K } from './retriever';
import type { ServerInfo } from '../src/types';

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
          documents: CORPUS.length,
          llmConfigured: isConfigured(cfg),
        };
        return send(res, 200, info);
      }
      if (req.method === 'POST' && path === '/api/query') {
        const { query } = await readJson(req);
        if (typeof query !== 'string' || !query.trim()) return send(res, 400, { error: 'Query is required.' });
        return send(res, 200, await runQuery(cfg, query.trim()));
      }
      if (req.method === 'POST' && path === '/api/eval') {
        return send(res, 200, await runEvaluation(cfg));
      }
    } catch (err) {
      return send(res, 500, { error: err instanceof Error ? err.message : String(err) });
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
