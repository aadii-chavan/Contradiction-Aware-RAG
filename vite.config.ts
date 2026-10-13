import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { ragApi } from './server/plugin';

export default defineConfig({
  plugins: [react(), ragApi()],
});
