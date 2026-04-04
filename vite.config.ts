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
    hmr: host
      ? { protocol: 'ws', host, port: 5183 }
      : undefined,
    watch: {
      // Don't watch the Rust source — cargo handles that
      ignored: ['**/src-tauri/**'],
    },
    proxy: {
      '/zb-api': {
        target: 'https://api.zeeble.xyz',
        changeOrigin: true,
        secure: false,
        rewrite: (path) => path.replace(/^\/zb-api/, ''),
      },
      '/zb-cloud': {
        target: 'https://cloud.zeeble.xyz',
        changeOrigin: true,
        secure: false,
        rewrite: (path) => path.replace(/^\/zb-cloud/, ''),
      },
    },
  },

  // Expose VITE_ and TAURI_ENV_ prefixed env vars to the frontend
  envPrefix: ['VITE_', 'TAURI_ENV_*'],

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
