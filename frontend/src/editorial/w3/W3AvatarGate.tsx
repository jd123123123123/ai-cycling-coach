import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Camera, Sparkles, UserRound, Plus } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { useGarage } from '../../hooks/useGarage'
import { T, FONT } from './w3tokens'
import './w3.css'

/**
 * W3 · Avatar gate — the open-the-app invitation to build your rider.
 *
 * A watcher mounted once inside the Router (next to W3RideCelebrationWatcher).
 * A rider with no DIGITALISED rider in their garage (`garage.rider == null`) is
 * invited to make one ONCE PER APP OPEN — the flag lives in sessionStorage, never
 * localStorage, so "Später" is honest: it goes away now and comes back the next
 * time they open the app. It is an invitation, never a scold; the empty ring is
 * the whole argument.
 *
 * Guards, so it can never trap or nag:
 *  - only inside the W3 experience (`/e/w3-*`), never on the design previews;
 *  - never on the avatar/onboarding/auth routes themselves (that's the loop),
 *    and never on the celebrate/share moments it would step on;
 *  - never while auth is still resolving, and never without a user;
 *  - fires once per browser session, recorded BEFORE it opens, so a re-render
 *    or a route change can't re-fire it.
 *
 * Mount (App.tsx, inside <BrowserRouter>):
 *   import W3AvatarGate from './editorial/w3/W3AvatarGate'
 *   … <W3AvatarGate />
 */

const SEEN_KEY = 'w3.avatarGateShown'
/** A beat after the screen settles — it should feel offered, not thrown. */
const OPEN_DELAY_MS = 900

const BLOCKED_PREFIXES = [
  '/e/w3-avatar-onboard',   // the destination itself
  '/e/w3-onboard',          // mid-onboarding
  '/e/w3-first-bike',       // the step right after the avatar step
  '/e/w3-connected',
  '/e/w3-ride-celebrate',   // don't step on a celebration
  '/e/w3-share',
  '/e/w3-login',
  '/e/w3-register',
  '/e/w3-auth',
]

export default function W3AvatarGate() {
  const navigate = useNavigate()
  const location = useLocation()
  const { user, isLoading } = useAuth()
  const { data: garage, isLoading: garageLoading } = useGarage()
  const reduce = useReducedMotion()
  const [open, setOpen] = useState(false)
  const firedRef = useRef(false)
  const primaryRef = useRef<HTMLButtonElement>(null)

  const path = location.pathname
  // "Has a rider" means a DIGITALISED rider in the garage, not merely a
  // `users.avatar_url`. Those are two different things: avatar_url also holds
  // the raw-photo fallback from before the garage existed (and from a render
  // that ran with no image model), so a rider can have an avatar_url and still
  // have no rider figure — in which case the ride hero reports `needs_rider`
  // while this gate stayed silent. The garage is the source of truth.
  const eligible =
    !isLoading &&
    !!user &&
    !garageLoading &&
    !garage?.rider?.image_base64 &&
    path.startsWith('/e/w3-') &&
    !path.endsWith('-preview') &&
    !BLOCKED_PREFIXES.some((p) => path.startsWith(p))

  useEffect(() => {
    if (firedRef.current || !eligible) return
    let seen: string | null = null
    try { seen = sessionStorage.getItem(SEEN_KEY) } catch { /* private mode */ }
    if (seen) { firedRef.current = true; return }
    const t = window.setTimeout(() => {
      // Record BEFORE opening so a re-render / a route change can't re-fire.
      firedRef.current = true
      try { sessionStorage.setItem(SEEN_KEY, '1') } catch { /* ignore */ }
      setOpen(true)
    }, OPEN_DELAY_MS)
    return () => window.clearTimeout(t)
  }, [eligible])

  // Escape dismisses; focus lands on the invitation, not on the way out.
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    window.addEventListener('keydown', onKey)
    const focus = window.setTimeout(() => primaryRef.current?.focus(), reduce ? 0 : 340)
    return () => { window.removeEventListener('keydown', onKey); window.clearTimeout(focus) }
  }, [open, reduce])

  const dismiss = () => setOpen(false)
  const create = () => { setOpen(false); navigate('/e/w3-avatar-onboard') }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="w3-root"
          initial={reduce ? false : { opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          style={{ position: 'fixed', inset: 0, zIndex: 120, background: '#000000B0', backdropFilter: 'blur(4px)', display: 'flex', justifyContent: 'center', alignItems: 'flex-end' }}
          onClick={dismiss}>
          <motion.div
            role="dialog" aria-modal="true" aria-labelledby="w3-avatar-gate-title"
            initial={reduce ? false : { y: '100%' }} animate={{ y: 0 }} exit={reduce ? undefined : { y: '100%' }}
            transition={{ type: 'spring', stiffness: 320, damping: 34 }}
            onClick={(e) => e.stopPropagation()}
            style={{ width: 390, maxWidth: '100%', background: T.bg, borderRadius: '28px 28px 0 0', border: `1px solid ${T.rule}`, borderBottom: 0, fontFamily: FONT, display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '10px 20px calc(22px + env(safe-area-inset-bottom))', gap: 14, position: 'relative', overflow: 'hidden' }}>

            {/* grabber */}
            <div style={{ width: 38, height: 4, borderRadius: 100, background: T.d2, flex: 'none' }} />

            {/* the empty seat — the whole argument, no words needed */}
            <div style={{ position: 'relative', width: '100%', display: 'grid', placeItems: 'center', paddingTop: 10 }}>
              <div style={{ position: 'absolute', top: -14, width: 260, height: 190, borderRadius: '50%', background: `radial-gradient(closest-side, ${T.acid}26, transparent)` }} />
              <div style={{ position: 'relative', width: 104, height: 104, borderRadius: 100, border: `2px dashed ${T.acid}66`, display: 'grid', placeItems: 'center', background: T.surface }}>
                <UserRound size={40} strokeWidth={1.4} color={T.quiet} />
                <div style={{ position: 'absolute', right: -2, bottom: -2, width: 34, height: 34, borderRadius: 100, background: T.acid, display: 'grid', placeItems: 'center', boxShadow: `0 0 20px ${T.acid}66` }}>
                  <Plus size={17} color="#0B0B0B" strokeWidth={2.6} />
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 6, alignItems: 'center', padding: '5px 11px', borderRadius: 100, background: T.acidDim, marginTop: 4 }}>
              <Sparkles size={11} color={T.acid} />
              <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: 1, color: T.acid }}>DEIN RIDER FEHLT NOCH</span>
            </div>

            <span id="w3-avatar-gate-title" style={{ fontSize: 26, fontWeight: 700, letterSpacing: -0.9, lineHeight: 1.1, color: T.ink, textAlign: 'center' }}>
              Der Platz auf dem Rad ist noch frei
            </span>
            <span style={{ fontSize: 13, fontWeight: 500, lineHeight: 1.5, color: T.mid, textAlign: 'center' }}>
              Ein Foto genügt — das Cycl_r Studio macht daraus deinen Collectible-Rider. Danach fährt er in jeder Fahrt, jeder Challenge und auf jedem Leaderboard mit.
            </span>

            <button ref={primaryRef} onClick={create}
              style={{ width: '100%', height: 54, borderRadius: 100, border: 0, background: T.acid, color: '#0B0B0B', fontFamily: FONT, fontSize: 16, fontWeight: 700, letterSpacing: -0.2, cursor: 'pointer', display: 'flex', gap: 10, justifyContent: 'center', alignItems: 'center', marginTop: 4 }}>
              <Camera size={18} color="#0B0B0B" />Rider erstellen
            </button>
            <button onClick={dismiss}
              style={{ width: '100%', height: 40, background: 'transparent', border: 0, color: T.quiet, fontFamily: FONT, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
              Später
            </button>
            <span style={{ fontSize: 10.5, fontWeight: 500, lineHeight: 1.4, color: T.quiet, textAlign: 'center' }}>
              Dein Foto wird einmal verwendet und danach verworfen. Dauert etwa eine Minute.
            </span>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
