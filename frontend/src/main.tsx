import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClient } from './lib/queryClient'
import { startPersistingQueries } from './lib/queryPersist'
import { warmRoute } from './lib/warmRoute'
import { LanguageProvider } from './contexts/LanguageContext'
import './index.css'
import App from './App.tsx'

// ── APPLY THE WEB FONTS ────────────────────────────────────────────────────
// `index.html` links the Google Fonts sheet with media="print" so it cannot
// block the first paint, and something has to switch it back on. That used to
// be an inline `onload` handler, which the app's strict `script-src 'self'`
// CSP blocks — so the sheet never applied and the whole app ran in fallback
// fonts on every screen. Doing it from the entry bundle is same-origin and
// allowed. If the element is ever gone, nothing happens and nothing throws.
document.getElementById('gfonts')?.setAttribute('media', 'all')

// Write the query cache back when the page is put away. Never torn down: these
// listeners live exactly as long as the document does.
startPersistingQueries(queryClient)

// Start this route's page chunk downloading NOW, in parallel with the auth
// round trips, instead of after them. See `warmRoute` for the waterfall it
// collapses.
warmRoute()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <LanguageProvider>
        <App />
      </LanguageProvider>
    </QueryClientProvider>
  </StrictMode>,
)
