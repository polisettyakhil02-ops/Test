import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'

export default defineConfig({
  // '/' for a domain root or a Docker/nginx deploy; '/<repo>/' for a GitHub
  // Pages project site. The router reads the same value at runtime.
  base: process.env.VITE_BASE || '/',
  plugins: [react()],
  resolve: { alias: { '@': path.resolve(import.meta.dirname, 'src') } },
  server: {
    port: 5173,
    // In development the API is a separate origin. Proxying /api through Vite
    // keeps the browser on one origin, so cookies behave exactly as they will
    // in production behind a single reverse proxy.
    proxy: {
      '/api': {
        target: process.env.VITE_API_PROXY || 'http://127.0.0.1:4000',
        changeOrigin: true,
      },
    },
  },
  build: { outDir: 'dist', sourcemap: false },
})
