import { useLocation, useNavigate } from 'react-router-dom'
import { Activity, Route as RouteIcon, Bike, Trophy, UserRound } from 'lucide-react'
import { T, FONT } from './w3tokens'

/**
 * The shared W3 bottom navigation. One source of truth for the 5-tab bar, so
 * every screen navigates consistently. Preview-aware: on a `*-preview` route it
 * navigates between previews (no auth needed for the design flow); on a live
 * route it navigates the real `/e/w3-*` pages. The active tab is derived from
 * the current path — no per-screen `active` prop to keep in sync.
 *
 * W3 style: glassy blurred bar, acid active tab lifted in an acid-tinted pill
 * with a soft glow, quiet inactive tabs, the home indicator.
 */

const TABS: { key: string; label: string; icon: typeof Activity; route: string }[] = [
  { key: 'today', label: 'TODAY', icon: Activity, route: 'w3-today' },
  { key: 'rides', label: 'RIDES', icon: RouteIcon, route: 'w3-rides' },
  { key: 'garage', label: 'GARAGE', icon: Bike, route: 'w3-bike-studio' },
  { key: 'wins', label: 'WINS', icon: Trophy, route: 'w3-wins' },
  { key: 'biker', label: 'BIKER', icon: UserRound, route: 'w3-biker' },
]

export default function W3TabBar() {
  const nav = useNavigate()
  const loc = useLocation()
  const preview = loc.pathname.includes('-preview')

  // active = the tab whose route base appears in the current path
  const activeKey = TABS.find((t) => loc.pathname.includes(t.route))?.key
    ?? (loc.pathname.includes('w3-session') || loc.pathname.includes('w3-ride') ? 'rides' : 'today')

  const go = (route: string) => {
    // GARAGE (bike-studio) has a preview; map others to their -preview twin in preview mode.
    const path = preview ? `/e/${route}-preview` : `/e/${route}`
    nav(path)
  }

  return (
    <div style={{ marginTop: 'auto', position: 'sticky', bottom: 0, width: '100%', height: 92, padding: '10px 14px 0', background: '#0B0B0BF2', backdropFilter: 'blur(14px)', borderTop: `1px solid ${T.rule}`, fontFamily: FONT, zIndex: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'stretch' }}>
        {TABS.map(({ key, label, icon: Icon, route }) => {
          const active = key === activeKey
          const col = active ? T.acid : T.quiet
          return (
            <button key={key} onClick={() => go(route)} aria-label={label} aria-current={active ? 'page' : undefined}
              style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 5, alignItems: 'center', justifyContent: 'center', padding: '8px 0 6px', background: 'transparent', border: 0, cursor: 'pointer', fontFamily: FONT, position: 'relative' }}>
              {active && <div style={{ position: 'absolute', top: 2, width: 46, height: 30, borderRadius: 100, background: T.acidDim, boxShadow: `0 0 18px ${T.acid}33` }} />}
              <Icon size={21} color={col} style={{ position: 'relative' }} />
              <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: 1, color: col, position: 'relative' }}>{label}</span>
            </button>
          )
        })}
      </div>
      <div style={{ height: 30, display: 'grid', placeItems: 'center' }}><div style={{ width: 134, height: 5, borderRadius: 100, background: '#FFFFFF59' }} /></div>
    </div>
  )
}
