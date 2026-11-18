import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

export default defineConfig(({ mode }) => ({
  root: fileURLToPath(new URL(".", import.meta.url)),
  envDir: fileURLToPath(new URL("..", import.meta.url)),
  plugins: [react(), {
    name: 'toursafe-offline-assets',
    generateBundle(_options, bundle) {
      const assets = Object.keys(bundle).filter(path => /\.(?:js|css|woff2?)$/.test(path)).map(path => `/${path}`);
      const revision = createHash('sha256').update(assets.join('\n')).digest('hex').slice(0, 12);
      this.emitFile({ type: 'asset', fileName: 'offline-assets.json', source: JSON.stringify(assets) });
      this.emitFile({ type: 'asset', fileName: 'sw.js', source: readFileSync(new URL('./public/sw.js', import.meta.url), 'utf8').replace('toursafe-shell-v18', `toursafe-shell-v18-${revision}`) });
    },
  }],
  ...(mode === 'android' ? { plugins: [react(), {
    name: 'toursafe-android-viewport',
    transformIndexHtml(html: string) { return html.replace('viewport-fit=cover', 'viewport-fit=contain'); },
  }] } : {}),
  server: {
    host: "127.0.0.1",
    port: 5173,
    strictPort: true,
    proxy: { "/api": "http://127.0.0.1:8787" },
  },
  build: { outDir: mode === 'android' ? 'dist-android' : 'dist', emptyOutDir: true },
}));
