/// <reference types="vitest/config" />
import { execSync } from 'node:child_process'
import { readFileSync, realpathSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { defineConfig, searchForWorkspaceRoot } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'


/**
 * Ship MapLibre's tile worker.
 *
 * MapLibre resolves its worker at RUNTIME, from inside its own bundle:
 *   new URL('./maplibre-gl-worker.mjs', import.meta.url)
 * In a production build that resolves to `/assets/maplibre-gl-worker.mjs` — a
 * file the bundler never emits, because nothing IMPORTS it. The result is the
 * nastiest possible failure: the map constructs, fetches its style and every
 * tile (all 200s), reports its sources loaded, and then never fires `load`,
 * never paints, and never errors. Every route page fell back to its SVG trace
 * on every device, and the tile provider looked innocent because it was.
 *
 * Dev has the same problem for a different reason (the worker's real path lies
 * outside the Vite root in a git worktree), which is why `server.fs.allow`
 * below exists. Both are the same missing file seen from two angles.
 *
 * Copied from the installed package rather than vendored into the repo, so it
 * can never drift from the version actually bundled.
 */
function maplibreWorker() {
  // TWO files, not one. The worker is an ES module that imports the library's
  // shared core from a SIBLING path (`./maplibre-gl-shared.mjs`), so shipping
  // the worker alone gets it as far as being fetched and no further: it fails
  // to instantiate, silently, with the same end result as not shipping it.
  // `shared` has no imports of its own, so the pair is the whole graph.
  const FILES = ['maplibre-gl-worker.mjs', 'maplibre-gl-shared.mjs']
  return {
    name: 'maplibre-worker-asset',
    apply: 'build' as const,
    generateBundle(this: { emitFile: (f: { type: 'asset'; fileName: string; source: string }) => void }) {
      for (const name of FILES) {
        const from = realpathSync(fileURLToPath(new URL(`./node_modules/maplibre-gl/dist/${name}`, import.meta.url)))
        this.emitFile({ type: 'asset', fileName: `assets/${name}`, source: readFileSync(from, 'utf8') })
      }
    },
  }
}

/** Short commit sha + build time, in whichever way is available.
 *
 *  The image build has no `.git` — it is in `.dockerignore`, and rightly so —
 *  so an env var takes precedence and the date stands alone when neither
 *  exists. The DATE is the part that answers the question anyway: "is this
 *  today's build" needs a clock, not a hash. */
function buildStamp(): string {
  const date = new Date().toISOString().slice(0, 16).replace('T', ' ')
  const fromEnv = process.env.BUILD_SHA || process.env.RAILWAY_GIT_COMMIT_SHA
  if (fromEnv) return `${fromEnv.slice(0, 7)} · ${date}`
  try {
    return `${execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim()} · ${date}`
  } catch {
    return date
  }
}

// https://vite.dev/config/
export default defineConfig({
  // WHICH BUILD AM I LOOKING AT. "I can't see the changes on my phone" is
  // otherwise unanswerable without a laptop: every surface in this app is
  // conditional on data, so a screen that looks unchanged proves nothing about
  // which bundle produced it. Stamped at build time and shown in the nav menu,
  // the question takes one look.
  define: {
    __BUILD_STAMP__: JSON.stringify(buildStamp()),
  },
  plugins: [react(), tailwindcss(), maplibreWorker()],
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
    fs: {
      // Git worktrees symlink `node_modules` back to the main checkout, so the
      // real path of every dependency lies OUTSIDE the Vite root and the dev
      // server answers 403 for it. That is invisible for ordinary imports —
      // they are pre-bundled — but MapLibre fetches its worker at RUNTIME by
      // URL, so the 403 lands as a map that draws no tiles and reports no
      // error. It cost an hour of chasing the tile provider, which was serving
      // 200s the whole time. Build output is unaffected; this is dev only.
      // realpath, not the link: Vite resolves each request to its real path
      // before testing it, so listing the symlink itself allows nothing.
      allow: [
        searchForWorkspaceRoot(process.cwd()),
        realpathSync(fileURLToPath(new URL('./node_modules', import.meta.url))),
      ],
    },
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
})
