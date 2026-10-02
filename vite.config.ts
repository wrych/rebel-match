import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

/** The client is built from /client; `/api` and `/auth` are proxied to the Node
 * server in development (ADR 0017). */
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
      '/api': 'http://localhost:3000',
      '/auth': 'http://localhost:3000',
    },
  },
})
