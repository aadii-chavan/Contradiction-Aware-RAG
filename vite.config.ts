import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { ragApi } from './server/plugin';

export default defineConfig(({ mode }) => {
  // The Python FastAPI backend (LangChain, ChromaDB, LangGraph) is reached through /py/*.
  const target = loadEnv(mode, process.cwd(), '').PY_BACKEND_URL || 'http://127.0.0.1:8000';
  const pyProxy = {
    '/py': { target, changeOrigin: true, rewrite: (path: string) => path.replace(/^\/py/, '') },
  };
  return {
    plugins: [react(), ragApi()],
    server: { proxy: pyProxy },
    preview: { proxy: pyProxy },
  };
});
