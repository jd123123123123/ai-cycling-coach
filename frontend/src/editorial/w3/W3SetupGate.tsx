import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Bike, Camera, Sparkles, UserRound, Plus } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { useGarage } from '../../hooks/useGarage'
import { T, FONT } from './w3tokens'
import './w3.css'

/**
 * W3 · Setup gate — the open-the-app invitation to finish your garage.
 *
 * A watcher mounted once inside the Router (next to W3RideCelebrationWatcher).
 *
 * WHY IT COVERS TWO THINGS NOW. It was the *avatar* gate, and it read only
 * `garage.rider`. But onboarding asks a rider for two collectibles — their
 * rider and their bike — and a rider who made a rider and no bike was never
 * asked again by anything. The Today hero reports `needs_bike` in place of
 * their machine and the gate stayed silent, which is the same shape of bug as
 * the avatar leak it already guards against: a screen that knows something is
 * missing next to a prompt that never fires.
 *
 * ONE INVITATION AT A TIME, and the rider comes first. Two sheets stacked on
 * one app open is a nag, and the rider is the half that appears on every
 * leaderboard, so it is the half worth asking for first. The bike is offered on
 * the next open — or immediately after the rider is made, which is the one
 * moment a second ask is welcome rather than tiring.
 *
 * "Has a rider" means a DIGITALISED rider in the garage, not merely a
 * `users.avatar_url`. Those are two different things: avatar_url also holds the
 * raw-photo fallback from before the garage existed (and from a render that ran
 * with no image model), so a rider can have an avatar_url and still have no
 * rider figure. The garage is the source of truth.
 *
 * Guards, so it can never trap or nag:
 *  - only inside the W3 experience (`/e/w3-*`), never on the design previews;
 *  - never on the studios/onboarding/auth routes themselves (that's the loop),
 *    and never on the celebrate/share moments it would step on;
 *  - never while auth or the garage is still resolving, and never without a user;
 *  - fires once per subject per browser session, recorded BEFORE it opens, so a
 *    re-render or a route change can't re-fire it.
 *
 * Mount (App.tsx, inside <BrowserRouter>):
 *   import W3SetupGate from './editorial/w3/W3SetupGate'
 *   … <W3SetupGate />
 */

type Subject = 'rider' | 'bike'

/** Per subject, so "Später" on the rider does not also silence the bike. */
const seenKey = (s: Subject) => `w3.setupGate.${s}`
/** A beat after the screen settles — it should feel offered, not thrown. */
const OPEN_DELAY_MS = 900

const BLOCKED_PREFIXES = [
  '/e/w3-avatar-onboard',   // the rider destination itself
  '/e/w3-onboard',          // mid-onboarding
  '/e/w3-first-bike',
  '/e/w3-bike-studio',      // the bike destination itself
  '/e/w3-connected',
  '/e/w3-ride-celebrate',   // don't step on a celebration
  '/e/w3-share',
  '/e/w3-login',
  '/e/w3-register',
  '/e/w3-auth',
]

/** What each half says for itself. The empty seat is the argument; the words
 *  only say what it is worth. */
const COPY: Record<Subject, {
  eyebrow: string; title: string; deck: string; cta: string; route: string; note: string
}> = {
  rider: {
    eyebrow: 'DEIN RIDER FEHLT NOCH',
    // Short enough to hold ONE line at 26/700 in a 350px column. The frame is
    // why: "Der Platz auf dem Rad ist noch frei" broke after "noch" and left
    // `frei` alone on line two, which reads as a mistake rather than a phrase.
    title: 'Der Sattel ist noch leer',
    deck: 'Ein Foto genügt. Danach fährt dein Rider in jeder Fahrt, jeder Challenge und auf jedem Leaderboard mit.',
    cta: 'Rider erstellen',
    route: '/e/w3-avatar-onboard',
    note: 'Dein Foto wird einmal verwendet und danach verworfen. Dauert etwa eine Minute.',
  },
  bike: {
    eyebrow: 'DEIN RAD FEHLT NOCH',
    title: 'Dein Rider hat noch kein Rad',
    deck: 'Fotografiere dein Rad von der Seite. Ridr erkennt Rahmen, Farbe und Aufbau — danach steht dein Rad auf Today, nicht irgendeins.',
    cta: 'Rad aufnehmen',
    route: '/e/w3-bike-studio',
    note: 'Ein Bild von der Antriebsseite reicht. Dauert etwa eine Minute.',
  },
}

export default function W3SetupGate() {
  const navigate = useNavigate()
  const location = useLocation()
  const { user, isLoading } = useAuth()
  const { data: garage, isLoading: garageLoading } = useGarage()
  const reduce = useReducedMotion()
  const [subject, setSubject] = useState<Subject | null>(null)
  const firedRef = useRef<Partial<Record<Subject, boolean>>>({})
  const primaryRef = useRef<HTMLButtonElement>(null)

  const path = location.pathname
  const noRider = !garage?.rider?.image_base64
  const noBike = !garage?.bike?.image_base64
  // The rider first, always — see the header. `null` means nothing to ask for.
  const missing: Subject | null = noRider ? 'rider' : noBike ? 'bike' : null
  // Only worth saying "Schritt 1 von 2" when there really are two.
  const bothMissing = noRider && noBike

  const eligible =
    !isLoading &&
    !!user &&
    !garageLoading &&
    missing !== null &&
    path.startsWith('/e/w3-') &&
    !path.endsWith('-preview') &&
    !BLOCKED_PREFIXES.some((p) => path.startsWith(p))

  useEffect(() => {
    if (!eligible || missing === null) return
    if (firedRef.current[missing]) return
    let seen: string | null = null
    try { seen = sessionStorage.getItem(seenKey(missing)) } catch { /* private mode */ }
    if (seen) { firedRef.current[missing] = true; return }
    const t = window.setTimeout(() => {
      // Record BEFORE opening so a re-render / a route change can't re-fire.
      firedRef.current[missing] = true
      try { sessionStorage.setItem(seenKey(missing), '1') } catch { /* ignore */ }
      setSubject(missing)
    }, OPEN_DELAY_MS)
    return () => window.clearTimeout(t)
  }, [eligible, missing])

  // Escape dismisses; focus lands on the invitation, not on the way out.
  useEffect(() => {
    if (!subject) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setSubject(null) }
    window.addEventListener('keydown', onKey)
    const focus = window.setTimeout(() => primaryRef.current?.focus(), reduce ? 0 : 340)
    return () => { window.removeEventListener('keydown', onKey); window.clearTimeout(focus) }
  }, [subject, reduce])

  const dismiss = () => setSubject(null)
  const go = () => { const s = subject; setSubject(null); if (s) navigate(COPY[s].route) }

  const copy = subject ? COPY[subject] : null

  return (
    <AnimatePresence>
      {subject && copy && (
        <motion.div
          className="w3-root"
          initial={reduce ? false : { opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          style={{ position: 'fixed', inset: 0, zIndex: 120, background: '#000000B0', backdropFilter: 'blur(4px)', display: 'flex', justifyContent: 'center', alignItems: 'flex-end' }}
          onClick={dismiss}>
          <motion.div
            role="dialog" aria-modal="true" aria-labelledby="w3-setup-gate-title"
            initial={reduce ? false : { y: '100%' }} animate={{ y: 0 }} exit={reduce ? undefined : { y: '100%' }}
            transition={{ type: 'spring', stiffness: 320, damping: 34 }}
            onClick={(e) => e.stopPropagation()}
            style={{ width: 390, maxWidth: '100%', background: T.bg, borderRadius: '28px 28px 0 0', border: `1px solid ${T.rule}`, borderBottom: 0, fontFamily: FONT, display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '10px 20px calc(22px + env(safe-area-inset-bottom))', gap: 14, position: 'relative', overflow: 'hidden' }}>

            {/* grabber */}
            <div style={{ width: 38, height: 4, borderRadius: 100, background: T.d2, flex: 'none' }} />

            {/* THE EMPTY SEAT — the whole argument, no words needed, and it
                MOVES. A still dashed ring reads as a disabled control; the same
                ring breathing reads as a slot waiting to be filled. The figure
                floats, the bloom behind it pulses against that float, and the
                acid badge arrives last so the eye ends on the thing you tap. */}
            <div style={{ position: 'relative', width: '100%', display: 'grid', placeItems: 'center', paddingTop: 10 }}>
              <motion.div
                aria-hidden
                initial={reduce ? false : { opacity: 0.5, scale: 0.9 }}
                animate={reduce ? undefined : { opacity: [0.5, 0.95, 0.5], scale: [0.9, 1.06, 0.9] }}
                transition={{ duration: 3.4, repeat: Infinity, ease: 'easeInOut' }}
                style={{ position: 'absolute', top: -14, width: 260, height: 190, borderRadius: '50%', background: `radial-gradient(closest-side, ${T.acid}26, transparent)` }} />
              <motion.div
                initial={reduce ? false : { y: 0 }}
                animate={reduce ? undefined : { y: [0, -7, 0] }}
                transition={{ duration: 3.4, repeat: Infinity, ease: 'easeInOut' }}
                style={{ position: 'relative', width: 104, height: 104, borderRadius: 100, border: `2px dashed ${T.acid}66`, display: 'grid', placeItems: 'center', background: T.surface }}>
                {subject === 'rider'
                  ? <UserRound size={40} strokeWidth={1.4} color={T.quiet} />
                  : <Bike size={42} strokeWidth={1.4} color={T.quiet} />}
                <motion.div
                  initial={reduce ? false : { scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: 'spring', stiffness: 520, damping: 18, delay: reduce ? 0 : 0.45 }}
                  style={{ position: 'absolute', right: -2, bottom: -2, width: 34, height: 34, borderRadius: 100, background: T.acid, display: 'grid', placeItems: 'center', boxShadow: `0 0 20px ${T.acid}66` }}>
                  <Plus size={17} color={T.bg} strokeWidth={2.6} />
                </motion.div>
              </motion.div>
            </div>

            <div style={{ display: 'flex', gap: 6, alignItems: 'center', padding: '5px 11px', borderRadius: 100, background: T.acidDim, marginTop: 4 }}>
              <Sparkles size={11} color={T.acid} />
              <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: 1, color: T.acid }}>
                {copy.eyebrow}{bothMissing ? ' · 1 VON 2' : ''}
              </span>
            </div>

            <span id="w3-setup-gate-title" style={{ fontSize: 26, fontWeight: 700, letterSpacing: -0.9, lineHeight: 1.1, color: T.ink, textAlign: 'center', textWrap: 'balance' }}>
              {copy.title}
            </span>
            <span style={{ fontSize: 13, fontWeight: 500, lineHeight: 1.5, color: T.mid, textAlign: 'center' }}>
              {copy.deck}
            </span>

            <button ref={primaryRef} onClick={go}
              style={{ width: '100%', height: 54, borderRadius: 100, border: 0, background: T.acid, color: T.bg, fontFamily: FONT, fontSize: 16, fontWeight: 700, letterSpacing: -0.2, cursor: 'pointer', display: 'flex', gap: 10, justifyContent: 'center', alignItems: 'center', marginTop: 4 }}>
              <Camera size={18} color={T.bg} />{copy.cta}
            </button>
            <button onClick={dismiss}
              style={{ width: '100%', height: 40, background: 'transparent', border: 0, color: T.quiet, fontFamily: FONT, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
              Später
            </button>
            <span style={{ fontSize: 10.5, fontWeight: 500, lineHeight: 1.4, color: T.quiet, textAlign: 'center', textWrap: 'balance' }}>
              {copy.note}
            </span>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
