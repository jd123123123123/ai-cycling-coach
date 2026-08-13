import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence, useReducedMotion } from 'motion/react'
import {
  Menu, X, Activity, CalendarRange, Target, Route as RouteIcon, Bike, Trophy,
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
  { label: 'Today', sub: 'Your day', icon: Activity, route: '/e/w3-today' },
  { label: 'Training plan', sub: 'The periodized plan', icon: CalendarRange, route: '/e/w3-plan' },
  { label: 'Your goal', sub: 'Target event + gaps', icon: Target, route: '/e/w3-goal' },
  { label: 'Rides', sub: 'Your history', icon: RouteIcon, route: '/e/w3-rides' },
  { label: 'Garage', sub: 'Your bike studio', icon: Bike, route: '/e/w3-bike-studio' },
  { label: 'Wins', sub: 'Badges + challenges', icon: Trophy, route: '/e/w3-wins' },
  { label: 'Challenges', sub: 'Monthly targets', icon: Flag, route: '/e/w3-challenges' },
  { label: 'Crew', sub: 'Your riders', icon: Users, route: '/e/w3-crew' },
  { label: 'Referrals', sub: 'Bring a partner', icon: UserRound, route: '/e/w3-referrals' },
  { label: 'Biker', sub: 'Profile + devices', icon: Settings, route: '/e/w3-biker' },
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

export default function W3NavMenu({ color = T.ink }: { color?: string }) {
  const nav = useNavigate()
  const reduce = useReducedMotion()
  const [open, setOpen] = useState(false)

  return (
    <>
      <button onClick={() => setOpen(true)} aria-label="Menu"
        style={{ width: 38, height: 38, borderRadius: 100, background: T.surface, border: 0, display: 'grid', placeItems: 'center', cursor: 'pointer' }}>
        <Menu size={17} color={color} />
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
                <span style={{ fontSize: 20, fontWeight: 700, color: T.ink }}>Go to</span>
                <button onClick={() => setOpen(false)} aria-label="Close" style={{ width: 38, height: 38, borderRadius: 100, background: T.surface, border: 0, display: 'grid', placeItems: 'center', cursor: 'pointer' }}><X size={18} color={T.mid} /></button>
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
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}
