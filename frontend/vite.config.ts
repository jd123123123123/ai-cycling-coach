import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
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
