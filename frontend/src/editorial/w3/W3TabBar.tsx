import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Activity, Route as RouteIcon, Bike, Trophy, UserRound } from 'lucide-react'
import { T, FONT } from './w3tokens'
import { preloadTab, scheduleW3TabPrefetch } from './w3TabChunks'

/**
 * The shared W3 bottom navigation. One source of truth for the 5-tab bar, so
 * every screen navigates consistently. Preview-aware: on a `*-preview` route it
 * navigates between previews (no auth needed for the design flow); on a live
 * route it navigates the real `/e/w3-*` pages. The active tab is derived from
 * the current path — no per-screen `active` prop to keep in sync.
 *
 * W3 style: glassy blurred bar, acid active tab lifted in an acid-tinted pill
 * with a soft glow, quiet inactive tabs, the home indicator.
 *
 * ── Making the tabs instant ───────────────────────────────────────────────
 * 1. On mount we queue an idle-time warm-up of every W3 destination chunk
 *    (`scheduleW3TabPrefetch`) — the five tabs together, then the non-tab
 *    screens reached through Today and Rides, one at a time; see w3TabChunks
 *    for the tiering. Idle rather than hover/touchstart because this
 *    is a 390px touch UI: there is no hover, and touchstart→click is ~0 ms, so
 *    an intent-triggered prefetch would arrive far too late to help. The bar
 *    only renders inside the W3 shell, so nobody outside it pays the bytes, and
 *    the loaders stay dynamic imports — the entry bundle is untouched.
 * 2. Because App's Suspense boundary now holds the OUTGOING screen while a cold
 *    chunk loads, a tap on a not-yet-warm tab would otherwise look like nothing
 *    happened for as long as the download takes. `pending` lights the acid pill
 *    on the tapped tab immediately, so the bar always answers the touch.
 */

const TABS: { key: string; label: string; icon: typeof Activity; route: string }[] = [
  { key: 'today', label: 'HEUTE', icon: Activity, route: 'w3-today' },
  { key: 'rides', label: 'FAHRTEN', icon: RouteIcon, route: 'w3-rides' },
  { key: 'garage', label: 'GARAGE', icon: Bike, route: 'w3-garage' },
  { key: 'wins', label: 'ERFOLGE', icon: Trophy, route: 'w3-wins' },
  { key: 'biker', label: 'BIKER', icon: UserRound, route: 'w3-biker' },
]

export default function W3TabBar() {
  const nav = useNavigate()
  const loc = useLocation()
  const preview = loc.pathname.includes('-preview')

  // active = the tab whose route base appears in the current path; secondary
  // screens map to their closest tab so the bar never wrongly lights "Today".
  const p = loc.pathname
  const related: [RegExp, string][] = [
    [/w3-bike-studio/, 'garage'],
    [/w3-session|w3-ride/, 'rides'],
    [/w3-crew|w3-referral/, 'biker'],
    [/w3-challenge/, 'wins'],
    [/w3-plan|w3-goal/, 'today'],
  ]
  const activeKey = TABS.find((t) => p.includes(t.route))?.key
    ?? related.find(([re]) => re.test(p))?.[1]
    ?? 'today'

  // Warm the destination chunks once the current screen has settled.
  useEffect(() => scheduleW3TabPrefetch(), [])

  // Optimistic active tab: the pill moves on tap, not on arrival. We remember
  // the path we were LEAVING, so the guess expires by derivation the moment the
  // location actually changes — no effect, no setState-after-render.
  const [pending, setPending] = useState<{ from: string; key: string } | null>(null)
  const shownKey = pending && pending.from === p ? pending.key : activeKey

  const go = (key: string, route: string) => {
    // GARAGE (bike-studio) has a preview; map others to their -preview twin in preview mode.
    const path = preview ? `/e/${route}-preview` : `/e/${route}`
    if (path === p) return
    setPending({ from: p, key })
    nav(path)
  }

  return (
    <>
      {/* In-flow spacer: reserves the bar's height so page content never hides
          behind the fixed bar. Only screens that render the bar reserve space. */}
      <div aria-hidden style={{ marginTop: 'auto', height: 'calc(92px + env(safe-area-inset-bottom))' }} />
      {/* The bar itself is viewport-fixed → always visible regardless of scroll,
          centered within the 390px frame on desktop. */}
      <div style={{ position: 'fixed', bottom: 0, left: '50%', transform: 'translateX(-50%)', width: 390, maxWidth: '100%', height: 'calc(92px + env(safe-area-inset-bottom))', padding: '10px 14px calc(0px + env(safe-area-inset-bottom))', background: '#0B0B0BF2', backdropFilter: 'blur(14px)', WebkitBackdropFilter: 'blur(14px)', borderTop: `1px solid ${T.rule}`, fontFamily: FONT, zIndex: 50 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'stretch' }}>
          {TABS.map(({ key, label, icon: Icon, route }) => {
            const active = key === shownKey
            const col = active ? T.acid : T.quiet
            return (
              <button key={key} onClick={() => go(key, route)}
                // The finger is already down; the tap is ~100 ms away and the
                // rider has visibly committed. Spending that gap on the chunk
                // is the difference between a screen that appears and a screen
                // that loads. Idempotent — the module registry dedupes, so a
                // scroll that grazes the bar costs nothing.
                onPointerDown={() => preloadTab(route)}
                aria-label={label} aria-current={key === activeKey ? 'page' : undefined}
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
    </>
  )
}
