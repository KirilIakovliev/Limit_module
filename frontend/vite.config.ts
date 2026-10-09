import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  base: '/next/',
  plugins: [react()],
  build: { outDir: 'dist', emptyOutDir: true, sourcemap: false },
  server: { proxy: { '/api': { target: 'http://127.0.0.1:8000', changeOrigin: true } } },
  test: { environment: 'jsdom', setupFiles: './src/test/setup.ts' },
});
