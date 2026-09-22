import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { TODAY_STAGE_KEY } from '../../hooks/useGarage'
import type { TodayStage } from '../../api/garage'
import { T, setW3Mode, w3Mode, type W3Mode } from './w3tokens'

/**
 * DARK OR WHITE, FOR THE WHOLE APP.
 *
 * The mode is not a setting buried in a menu — it is which backdrop the rider
 * has stood their bike on. `studio_black` is the near-black room every screen
 * has always been; `studio_white` is the same room with the lights on. The
 * ground the machine sits on is the ground the app sits on.
 *
 * WHY THIS REMOUNTS THE TREE. Colours are written inline all over this app
 * (`style={{ color: T.ink }}`), so a component only shows the new palette when
 * it renders again — and a context value alone re-renders consumers, not the
 * hundred and twenty files that merely import `T`. Changing the key under the
 * provider re-renders every one of them, once, on an action a rider takes
 * deliberately and rarely. The cost is transient component state, which on a
 * colour change is the honest outcome anyway: the room repaints.
 */

const KEY = 'ridr.w3.mode'

interface Ctx {
  mode: W3Mode
  setMode: (m: W3Mode) => void
}

const ModeContext = createContext<Ctx>({ mode: 'dark', setMode: () => {} })

/** Explicit themes in local preview frames never change the rider's saved mode. */
function previewMode(): W3Mode | null {
  if (!import.meta.env.DEV || !window.location.pathname.includes('-preview')) return null
  const mode = new URLSearchParams(window.location.search).get('theme')
  return mode === 'dark' || mode === 'light' ? mode : null
}

/** Read once, before the first paint, so a reload does not flash the old room. */
function stored(): W3Mode {
  const preview = previewMode()
  if (preview) return preview
  try {
    return localStorage.getItem(KEY) === 'light' ? 'light' : 'dark'
  } catch {
    return 'dark'   // private mode, or storage refused; the dark room is the default
  }
}

// Applied at MODULE scope, not in an effect: `setW3Mode` decides what the very
// first render reads out of the palette, and an effect runs after it.
setW3Mode(stored())

export function W3ModeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<W3Mode>(() => w3Mode())

  const setMode = useCallback((m: W3Mode) => {
    if (m === w3Mode()) return
    setW3Mode(m)
    try { if (!previewMode()) localStorage.setItem(KEY, m) } catch { /* nothing to remember it with */ }
    setModeState(m)
  }, [])

  // The document itself has to change too — the page background behind the app
  // frame, and the browser's own UI colour on a phone. A white app inside a
  // black page reads as a bug.
  useEffect(() => {
    const root = document.documentElement
    root.setAttribute('data-w3-mode', mode)
    root.style.colorScheme = mode
    // Straight off the palette, which `setW3Mode` has already switched — the
    // browser's own chrome must not carry a second copy of the ground colour.
    const meta = document.querySelector('meta[name="theme-color"]')
    if (meta) meta.setAttribute('content', T.bg)
  }, [mode])

  // ── FOLLOW THE BIKE ──────────────────────────────────────────────────
  // `useSelectStage` is the one funnel every backdrop change goes through — the
  // rail, the gallery, all of it — and it already writes the new stage into the
  // Today cache optimistically before the server answers. So the mode watches
  // that cache entry rather than fetching anything of its own: the room changes
  // in the same frame the rider taps, and it corrects itself if the server
  // refuses. It also means a rider who switched on another device arrives here
  // already in the right room, because the first read of `/garage/today` lands
  // in the same place.
  const qc = useQueryClient()
  useEffect(() => {
    if (previewMode()) return
    const sync = () => {
      const stage = qc.getQueryData<TodayStage>(TODAY_STAGE_KEY)?.stage
      if (stage) setMode(modeForBackdrop(stage))
    }
    sync()
    return qc.getQueryCache().subscribe((e) => {
      if (e.query.queryHash === JSON.stringify(TODAY_STAGE_KEY)) sync()
    })
  }, [qc, setMode])

  const value = useMemo(() => ({ mode, setMode }), [mode, setMode])

  return (
    <ModeContext.Provider value={value}>
      {/* The key is the mechanism. See the note above. */}
      <div key={mode} style={{ display: 'contents' }}>{children}</div>
    </ModeContext.Provider>
  )
}

export function useW3Mode(): Ctx {
  return useContext(ModeContext)
}

/** Which backdrop means which room. The catalogue is code on the server; this
 *  is the one id the client has to know by name. */
export const WHITE_STUDIO_ID = 'studio_white'

export function modeForBackdrop(backdropId: string | null | undefined): W3Mode {
  return backdropId === WHITE_STUDIO_ID ? 'light' : 'dark'
}
