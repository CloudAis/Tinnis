import { defineConfig } from 'vite';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

export default defineConfig({
  base: './',
  server: { host: '0.0.0.0', port: 5173, strictPort: true },
  build: { target: 'es2022', rollupOptions: { output: { manualChunks: { three: ['three'] } } } },
  plugins: [{
    name: 'offline-manifest',
    closeBundle() {
      const dir = resolve('dist');
      const assets = readdirSync(resolve(dir, 'assets')).map(n => `./assets/${n}`);
      const files = ['./', './index.html', './favicon.svg', ...assets];
      const version = Date.now().toString(36);
      const sw = readFileSync('offline-worker.js', 'utf8')
        .replace('__PRECACHE__', JSON.stringify(files)).replace('__VERSION__', version);
      writeFileSync(resolve(dir, 'sw.js'), sw);
    },
  }],
});
