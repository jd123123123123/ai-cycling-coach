import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence, useReducedMotion } from 'motion/react'
import { ScanFace,
  Menu, X, Activity, CalendarRange, CalendarCheck, Target, Route as RouteIcon, Bike, Trophy,
  Flag, Users, UserRound, Settings,
} from 'lucide-react'
import { T, FONT } from './w3tokens'

/**
 * W3 · Nav menu — the header "everything" menu. The 5-tab bottom bar covers the
 * daily surfaces; this sheet reaches the rest (plan, goal, crew, challenges,
 * referrals, settings) so no screen is stranded. Self-contained (owns its open
 * state + navigation); drop <W3NavMenu/> into any screen header.
 */
const ITEMS: { label: string; sub: string; icon: typeof Activity; route: string }[] = [
  { label: 'Heute', sub: 'Dein Tag', icon: Activity, route: '/e/w3-today' },
  { label: 'Trainingsplan', sub: 'Der periodisierte Plan', icon: CalendarRange, route: '/e/w3-plan' },
  { label: 'Wochenrückblick', sub: 'Letzte Woche + diese Woche', icon: CalendarCheck, route: '/e/w3-week-review' },
  { label: 'Dein Ziel', sub: 'Zielevent + Lücken', icon: Target, route: '/e/w3-goal' },
  { label: 'Fahrten', sub: 'Dein Verlauf', icon: RouteIcon, route: '/e/w3-rides' },
  // Both studios are reachable here for the same reason: onboarding asks for
  // each photograph exactly once, so this menu is the ONLY way a rider changes
  // their face or their bike afterwards. Without these two entries the answer
  // to "I want a better photo" would be "clear your storage".
  { label: 'Dein Bike', sub: 'Foto neu aufnehmen', icon: Bike, route: '/e/w3-bike-studio' },
  { label: 'Dein Avatar', sub: 'Foto neu aufnehmen', icon: ScanFace, route: '/e/w3-avatar-onboard' },
  { label: 'Erfolge', sub: 'Abzeichen + Challenges', icon: Trophy, route: '/e/w3-wins' },
  { label: 'Challenges', sub: 'Monatsziele', icon: Flag, route: '/e/w3-challenges' },
  { label: 'Crew', sub: 'Deine Fahrer', icon: Users, route: '/e/w3-crew' },
  { label: 'Empfehlungen', sub: 'Bring jemanden mit', icon: UserRound, route: '/e/w3-referrals' },
  { label: 'Biker', sub: 'Profil + Geräte', icon: Settings, route: '/e/w3-biker' },
]

/** A self-contained round header icon that navigates to a route on tap. */
export function W3NavIcon({ to, children, label }: { to: string; children: React.ReactNode; label: string }) {
  const nav = useNavigate()
  return (
    <button onClick={() => nav(to)} aria-label={label}
      style={{ width: 38, height: 38, borderRadius: 100, background: T.surface, border: 0, display: 'grid', placeItems: 'center', cursor: 'pointer' }}>
      {children}
    </button>
  )
}

/**
 * The trigger is configurable because Today's stage (pen `YIU3g`/`qv4Aw`) shows
 * it as a 44px gear on the stage floor rather than a 38px burger in a header —
 * but it must open the SAME sheet. Every route above is reachable only from
 * here, so giving that screen its own lookalike button would have stranded them
 * the moment the two drifted apart.
 */
export default function W3NavMenu({
  color = T.ink, size = 38, iconSize = 17, background = T.surface, Icon = Menu,
}: {
  color?: string
  size?: number
  iconSize?: number
  background?: string
  Icon?: typeof Menu
}) {
  const nav = useNavigate()
  const reduce = useReducedMotion()
  const [open, setOpen] = useState(false)

  return (
    <>
      <button onClick={() => setOpen(true)} aria-label="Menü"
        style={{ width: size, height: size, borderRadius: 100, background, border: 0, display: 'grid', placeItems: 'center', cursor: 'pointer', padding: 0 }}>
        <Icon size={iconSize} color={color} />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={reduce ? false : { opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={() => setOpen(false)}
            style={{ position: 'fixed', inset: 0, zIndex: 100, background: '#000000B0', backdropFilter: 'blur(4px)', display: 'flex', justifyContent: 'center', alignItems: 'flex-end' }}>
            <motion.div
              initial={reduce ? false : { y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} transition={{ type: 'spring', stiffness: 320, damping: 34 }}
              onClick={(e) => e.stopPropagation()}
              style={{ width: 390, maxWidth: '100%', maxHeight: '86dvh', overflowY: 'auto', background: T.bg, borderRadius: '28px 28px 0 0', border: `1px solid ${T.rule}`, borderBottom: 0, fontFamily: FONT, padding: '18px 16px calc(20px + env(safe-area-inset-bottom))' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 6px 12px' }}>
                <span style={{ fontSize: 20, fontWeight: 700, color: T.ink }}>Gehe zu</span>
                <button onClick={() => setOpen(false)} aria-label="Schließen" style={{ width: 38, height: 38, borderRadius: 100, background: T.surface, border: 0, display: 'grid', placeItems: 'center', cursor: 'pointer' }}><X size={18} color={T.mid} /></button>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {ITEMS.map((it, i) => (
                  <button key={it.route} onClick={() => { setOpen(false); nav(it.route) }}
                    style={{ display: 'flex', gap: 14, alignItems: 'center', padding: '13px 8px', borderTop: i === 0 ? 'none' : `1px solid ${T.rule}`, background: 'transparent', border: 0, cursor: 'pointer', fontFamily: FONT, textAlign: 'left', width: '100%' }}>
                    <div style={{ width: 40, height: 40, borderRadius: 12, flex: 'none', background: T.acidDim, display: 'grid', placeItems: 'center' }}><it.icon size={18} color={T.acid} /></div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                      <span style={{ fontSize: 15, fontWeight: 700, color: T.ink }}>{it.label}</span>
                      <span style={{ fontSize: 11.5, fontWeight: 500, color: T.quiet }}>{it.sub}</span>
                    </div>
                  </button>
                ))}
              </div>

              {/* WHICH BUILD AM I LOOKING AT. Every surface in this app is
                  conditional on data, so a screen that looks unchanged proves
                  nothing about which bundle drew it — "I can't see the changes
                  on my phone" was otherwise unanswerable without a laptop.
                  Stamped at build time; one look settles it. */}
              <span style={{
                marginTop: 14, paddingTop: 12, borderTop: `1px solid ${T.rule}`,
                fontSize: 9.5, fontWeight: 600, letterSpacing: 0.6, color: T.quiet,
                fontVariantNumeric: 'tabular-nums',
              }}>
                BUILD {__BUILD_STAMP__}
              </span>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}
