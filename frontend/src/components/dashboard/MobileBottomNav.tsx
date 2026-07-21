import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { Zap, Footprints, Heart, BarChart3, Users, TrendingUp } from 'lucide-react'
import { useLocale } from '../../contexts/LocaleContext'

// Bottom navigation — rebuilt 1:1 from pencil-new.pen component/TabBar. A
// floating translucent pill with five surfaces: Today · Train · Recovery ·
// History · Social. Coral marks the active tab. Shown on every viewport (the
// app is phone-first, like the .pen).

type TabId = 'today' | 'plan' | 'progress' | 'recovery' | 'analyze' | 'social'

// `route` items navigate to a standalone page; the rest flip the ?tab= param.
const TABS: Array<{ id: TabId; en: string; de: string; icon: React.ReactNode; route?: string }> = [
  { id: 'today',    en: 'Today',    de: 'Heute',    icon: <Zap size={20} strokeWidth={2} /> },
  { id: 'plan',     en: 'Train',    de: 'Training', icon: <Footprints size={20} strokeWidth={2} /> },
  { id: 'progress', en: 'Progress', de: 'Fortschritt', icon: <TrendingUp size={20} strokeWidth={2} />, route: '/progress/bike' },
  { id: 'recovery', en: 'Recovery', de: 'Erholung', icon: <Heart size={20} strokeWidth={2} /> },
  { id: 'analyze',  en: 'History',  de: 'Verlauf',  icon: <BarChart3 size={20} strokeWidth={2} /> },
  { id: 'social',   en: 'Social',   de: 'Social',   icon: <Users size={20} strokeWidth={2} /> },
]

function resolveActive(raw: string | null): TabId {
  if (raw === 'plan' || raw === 'train' || raw === 'week' || raw === 'workouts') return 'plan'
  if (raw === 'recovery') return 'recovery'
  if (raw === 'analyze' || raw === 'history' || raw === 'trends' || raw === 'report') return 'analyze'
  if (raw === 'social' || raw === 'crew') return 'social'
  return 'today'
}

export default function MobileBottomNav() {
  const [searchParams, setSearchParams] = useSearchParams()
  const navigate = useNavigate()
  const location = useLocation()
  const { locale } = useLocale()
  const de = locale === 'de'
  // Honest active state (audit P1-12): a tab only lights up on its own
  // surface. /coach, /season, /load-form etc. previously kept 'Heute' lit —
  // a false you-are-here on 7+ routes. Non-dashboard routes (except
  // /progress) highlight nothing.
  const active: TabId | null = location.pathname.startsWith('/progress')
    ? 'progress'
    : location.pathname.startsWith('/dashboard')
      ? resolveActive(searchParams.get('tab'))
      : null

  function handleTab(tab: { id: TabId; route?: string }) {
    if (tab.route) {
      navigate(tab.route)
      return
    }
    // Coming from a standalone route (e.g. /progress), go back to the dashboard.
    if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/dashboard')) {
      navigate(`/dashboard?tab=${tab.id}`)
    } else {
      setSearchParams({ tab: tab.id }, { replace: true })
    }
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  return (
    <div
      className="fixed bottom-0 inset-x-0 z-40 flex justify-center px-4 pointer-events-none"
      style={{
        paddingBottom: 'calc(env(safe-area-inset-bottom) + 12px)',
        // translateZ(0) promotes it to its own layer (fixes the earlier scroll
        // *lag*). Do NOT add `will-change: transform` here: on a position:fixed
        // element iOS Safari then couples the bar to the scroll layer and it
        // detaches / "sticks" in mid-screen during momentum scroll.
        transform: 'translateZ(0)',
        WebkitTransform: 'translateZ(0)',
      }}
    >
      <nav
        className="pointer-events-auto flex items-stretch justify-between gap-0.5 w-full max-w-md"
        style={{
          // Solid (not backdrop-blur): backdrop-filter on a fixed element
          // repaints incorrectly on iOS scroll and makes the bar flicker/jump.
          background: '#161B22',
          border: '1px solid var(--color-rule)',
          borderRadius: 100,
          padding: '6px 6px',
          boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
        }}
        aria-label={de ? 'Hauptnavigation' : 'Main navigation'}
      >
        {TABS.map((tab) => {
          const isActive = tab.id === active
          const label = de ? tab.de : tab.en
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => handleTab(tab)}
              className="flex-1 flex flex-col items-center justify-center gap-0.5 rounded-full transition-colors"
              style={{
                color: isActive ? 'var(--color-accent)' : 'var(--color-muted)',
                background: isActive ? 'color-mix(in srgb, var(--color-accent) 15%, transparent)' : 'transparent',
                padding: '7px 3px',
                minHeight: 48,
              }}
              aria-current={isActive ? 'page' : undefined}
              aria-label={label}
            >
              {tab.icon}
              {/* 11px floor (audit P1-12) — 9px labels were sub-AA squint territory */}
              <span style={{ fontSize: 11, fontWeight: 600, color: isActive ? 'var(--color-accent)' : 'var(--color-muted)' }}>{label}</span>
            </button>
          )
        })}
      </nav>
    </div>
  )
}
