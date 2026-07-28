/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  // MapLibre GL must not go through esbuild dep pre-bundling. It spawns a web
  // worker for tile parsing, and the pre-bundled copy resolves that worker's
  // URL incorrectly: the map constructs, fetches its style and every TileJSON,
  // reports all sources "loaded" — and then requests zero tiles, never fires
  // `load`, and never sets isStyleLoaded(). No error is emitted anywhere, which
  // is what makes it a nasty half-hour. Proven by A/B: the identical style and
  // version render fine when imported straight from dist, bypassing the
  // optimizer. Excluding it here keeps the app's own dynamic import working.
  optimizeDeps: { exclude: ['maplibre-gl'] },
  test: {
    // Component tests arrived (Today's Road), so the runner now needs a DOM.
    // Pure-utility tests are unaffected by running under jsdom.
    environment: 'jsdom',
    include: ['src/**/__tests__/**/*.test.{ts,tsx}'],
    // Pre-existing PENDING stubs from phase 06.1: written as fully
    // commented-out bodies while test infra was absent, so they collect as
    // "no test suite found". The infra they asked for now exists — activating
    // them is real work, tracked separately. Remove an entry when activated.
    exclude: [
      '**/node_modules/**',
      'src/components/ui/__tests__/CommandPalette.test.tsx',
      'src/components/ui/__tests__/SegmentedTabs.test.tsx',
      'src/components/ui/__tests__/SideSheet.test.tsx',
    ],
  },
  build: {
    // Keep a sensible warning threshold now that heavy deps live in their own
    // long-cached vendor chunks rather than one 3MB entry file.
    chunkSizeWarningLimit: 800,
    rollupOptions: {
      output: {
        // Split large third-party deps into separate, long-cached vendor chunks
        // so the initial critical chunk stays small and vendor code survives
        // across app deploys (content hash only changes when the dep changes).
        manualChunks: (id: string) => {
          if (!id.includes('node_modules')) return undefined
          if (/[\\/]node_modules[\\/](react|react-dom|react-router|react-router-dom|scheduler)[\\/]/.test(id))
            return 'vendor-react'
          if (/[\\/]node_modules[\\/]recharts[\\/]/.test(id)) return 'vendor-recharts'
          if (/[\\/]node_modules[\\/]react-grid-layout[\\/]/.test(id)) return 'vendor-grid'
          if (/[\\/]node_modules[\\/]motion[\\/]/.test(id)) return 'vendor-motion'
          if (/[\\/]node_modules[\\/]date-fns[\\/]/.test(id)) return 'vendor-datefns'
          if (/[\\/]node_modules[\\/]lucide-react[\\/]/.test(id)) return 'vendor-lucide'
          if (/[\\/]node_modules[\\/]@tanstack[\\/]/.test(id)) return 'vendor-query'
          return undefined
        },
      },
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
})
