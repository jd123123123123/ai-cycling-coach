import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, useReducedMotion } from 'motion/react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { claimGate, releaseGate } from './w3gates'
import { useMorningBriefing } from './useMorningBriefing'
import { morningDayKey, isMorning, MORNING_GATE_ID, MORNING_OPEN_DELAY_MS } from './w3morning'
import W3MorningSheet from './W3MorningSheet'

/**
 * W3 · The morning briefing — the day in one page, once a day.
 *
 * A watcher mounted inside the Router next to the other two. The first time a
 * rider opens the app in the morning it hands them the day: what today is, why,
 * when to go out, and the two or three readings that reason rests on. Then it
 * does not appear again until tomorrow.
 *
 * ── WHY A SHEET AND NOT A ROUTE ──────────────────────────────────────────
 * `/e/morning` already exists and is a seven-chapter deck — the long read, on
 * purpose. This is the opposite object: one page, closable in a tap, and it
 * must not cost a rider their place. Making it a route would hand the deck's
 * job to a screen that is supposed to be a greeting.
 *
 * ── ONCE A DAY, KEYED ON THE DAY ─────────────────────────────────────────
 * localStorage keyed by the LOCAL date, so "I have read today's" survives a
 * reload and a second tab and expires by itself at midnight. sessionStorage
 * would re-fire it every time the rider reopened the app before lunch — which
 * is precisely the behaviour that makes people dread an app's daily popup.
 *
 * ── AND ONLY IN THE MORNING ──────────────────────────────────────────────
 * A greeting that says "Guten Morgen" at 16:00 is a bug a rider can read. If
 * they never open the app before noon they never get one, and that is correct:
 * by the afternoon the Today screen is a better answer than a summary of it.
 *
 * Guards, so it can never trap or nag: only inside `/e/w3-*`, never on the
 * previews, never mid-onboarding or on the auth / share / celebrate / session
 * screens, never while auth is resolving, never when nothing resolved
 * (`briefing.bare` — an empty greeting is worse than none), and never at the
 * same time as another gate (`claimGate`).
 *
 * Mount (App.tsx, inside <BrowserRouter>):
 *   import W3MorningGate from './editorial/w3/W3MorningGate'
 *   … <W3MorningGate />
 */

const BLOCKED_PREFIXES = [
  '/e/morning',             // the long read — never over its own deck
  '/e/w3-onboard',
  '/e/w3-avatar-onboard',
  '/e/w3-first-bike',
  '/e/w3-bike-studio',
  '/e/w3-connected',
  '/e/w3-ride-celebrate',
  '/e/w3-session',          // never interrupt a ride
  '/e/w3-share',
  '/e/w3-week-review',
  '/e/w3-login',
  '/e/w3-register',
  '/e/w3-auth',
]

export default function W3MorningGate() {
  const navigate = useNavigate()
  const location = useLocation()
  const { user, isLoading } = useAuth()
  const reduce = useReducedMotion()
  const briefing = useMorningBriefing()
  const [open, setOpen] = useState(false)
  const firedRef = useRef(false)
  const primaryRef = useRef<HTMLButtonElement>(null)

  const path = location.pathname
  const eligible =
    !isLoading &&
    !!user &&
    isMorning(new Date()) &&
    !briefing.bare &&
    path.startsWith('/e/w3-') &&
    !path.endsWith('-preview') &&
    !BLOCKED_PREFIXES.some((p) => path.startsWith(p))

  useEffect(() => {
    if (firedRef.current || !eligible) return
    const key = morningDayKey(new Date())
    let seen: string | null = null
    try { seen = localStorage.getItem(key) } catch { /* private mode */ }
    if (seen) { firedRef.current = true; return }
    const t = window.setTimeout(() => {
      firedRef.current = true
      if (!claimGate(MORNING_GATE_ID)) return
      // Recorded BEFORE opening, so a re-render or a second tab cannot
      // double-fire it — and so a rider who force-quits mid-read is not handed
      // the same briefing again an hour later.
      try { localStorage.setItem(key, '1') } catch { /* ignore */ }
      setOpen(true)
    }, MORNING_OPEN_DELAY_MS)
    return () => window.clearTimeout(t)
  }, [eligible])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setOpen(false); releaseGate(MORNING_GATE_ID) }
    }
    window.addEventListener('keydown', onKey)
    const focus = window.setTimeout(() => primaryRef.current?.focus(), reduce ? 0 : 360)
    return () => { window.removeEventListener('keydown', onKey); window.clearTimeout(focus) }
  }, [open, reduce])

  const dismiss = () => { setOpen(false); releaseGate(MORNING_GATE_ID) }

  return (
    <AnimatePresence>
      {open && (
        <W3MorningSheet
          briefing={briefing}
          primaryRef={primaryRef}
          onClose={dismiss}
          onToday={() => { dismiss(); navigate('/e/w3-today') }} />
      )}
    </AnimatePresence>
  )
}
