// Starts the Python FastAPI backend and the Vite dev server together; Ctrl+C stops both.
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

const win = process.platform === 'win32';
const uvicorn = join('backend', '.venv', win ? 'Scripts' : 'bin', win ? 'uvicorn.exe' : 'uvicorn');
if (!existsSync(uvicorn)) {
  console.error('Python backend not set up. Run "npm run backend:setup" first (see README).');
  process.exit(1);
}

const procs = [
  spawn(uvicorn, ['app.main:app', '--port', '8000', '--app-dir', 'backend'], { stdio: 'inherit' }),
  spawn(win ? 'npx.cmd' : 'npx', ['vite'], { stdio: 'inherit' }),
];
const stop = () => procs.forEach((p) => p.kill('SIGINT'));
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
procs.forEach((p) => p.on('exit', (code) => {
  stop();
  process.exitCode = code ?? 0;
}));
