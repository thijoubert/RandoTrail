import { defineConfig, type Plugin } from 'vitest/config';
import { cpSync, existsSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

/** Serve `fixtures/` in dev and copy it into `dist/fixtures/` at build time (no extra dependency). */
function fixturesPlugin(): Plugin {
  const root = resolve(__dirname, 'fixtures');
  return {
    name: 'randotrail-fixtures',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = req.url ?? '';
        const idx = url.indexOf('/fixtures/');
        if (idx === -1) return next();
        const rel = url.slice(idx + '/fixtures/'.length).split('?')[0] ?? '';
        const file = join(root, rel);
        if (!file.startsWith(root) || !existsSync(file) || statSync(file).isDirectory()) return next();
        res.setHeader('Content-Type', file.endsWith('.json') ? 'application/json' : 'application/octet-stream');
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.end(readFileSync(file));
      });
    },
    closeBundle() {
      if (existsSync(root)) cpSync(root, resolve(__dirname, 'dist/fixtures'), { recursive: true });
    },
  };
}

export default defineConfig({
  base: process.env['BASE_PATH'] ?? '/',
  plugins: [fixturesPlugin()],
  build: { target: 'es2022', sourcemap: true, chunkSizeWarningLimit: 1500 },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    testTimeout: 30000,
  },
});
