/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// TAURI_DEV_HOST is set by the Tauri CLI when running on mobile/remote targets
const host = process.env.TAURI_DEV_HOST;

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],

  // Prevent Vite from clearing the terminal (Tauri CLI output appears above)
  clearScreen: false,

  server: {
    port: 5173,
    strictPort: true,
    host: host || false,
    // These headers cannot be set via HTML meta tags — they must come from the
    // HTTP server. Set them here for the dev server, and mirror them on any
    // production web server (nginx, caddy, etc.) that serves the built dist/.
    headers: {
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
    },
    hmr: host
      ? { protocol: 'ws', host, port: 5183 }
      : undefined,
    watch: {
      // Don't watch the Rust source — cargo handles that
      ignored: ['**/src-tauri/**'],
    },
    proxy: {
      '/zb-api': {
        target: 'http://localhost:8001',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/zb-api/, ''),
      },
      '/zb-cloud': {
        target: 'https://cloud.zeeble.xyz',
        changeOrigin: true,
        secure: false,
        rewrite: (path) => path.replace(/^\/zb-cloud/, ''),
      },
      '/zb-market': {
        target: 'https://market.zeeble.xyz',
        changeOrigin: true,
        secure: false,
        rewrite: (path) => path.replace(/^\/zb-market/, ''),
      },
    },
  },

  // Expose VITE_ and TAURI_ENV_ prefixed env vars to the frontend
  envPrefix: ['VITE_', 'TAURI_ENV_*'],

  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    exclude: ['**/node_modules/**', '**/src-tauri/**'],
  },

  build: {
    // Tauri requires a modern target; adjust per platform
    target: process.env.TAURI_ENV_PLATFORM === 'windows' ? 'chrome105' : 'safari13',
    // Don't minify in debug builds so DevTools source maps work
    minify: !process.env.TAURI_ENV_DEBUG ? 'oxc' : false,
    sourcemap: !!process.env.TAURI_ENV_DEBUG,
    // Chunks load from disk in Tauri — size has no impact on performance
    chunkSizeWarningLimit: 2000,
  },
})
