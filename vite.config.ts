import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

/**
 * The client is built from /client; `/api` and `/auth` are proxied to the Node
 * server in development (ADR 0017).
 *
 * The keys are anchored regexes, not prefixes. A plain `'/api'` key also matches
 * `/api.ts`, `/apiary` and anything else merely starting with those characters —
 * which silently proxies client modules to the server and serves them as HTML.
 */
export default defineConfig({
  root: fileURLToPath(new URL('client', import.meta.url)),
  plugins: [vue()],
  build: {
    outDir: fileURLToPath(new URL('dist/client', import.meta.url)),
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    proxy: {
      '^/api(/|$)': { target: 'http://localhost:3000', changeOrigin: false },
      '^/auth(/|$)': { target: 'http://localhost:3000', changeOrigin: false },
    },
  },
})
