import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { Zap, CalendarDays, Heart, TrendingUp } from 'lucide-react'
import { useLocale } from '../../contexts/LocaleContext'
import { CHAPTERS, type ChapterId } from '../../utils/seasonArc'

// Bottom navigation — rebuilt 1:1 from pencil-new.pen component/TabBar. A
// floating translucent pill, now with the four chapters of one season arc:
// Today · Plan · Body · History. Coral marks the active tab. Shown on every
// viewport (the app is phone-first, like the .pen).

// Four chapters of one season arc, not six topic buckets. Progress folded into
// History (both answer "did it work?"), and Social left the bar entirely —
// crew rides belong on the Plan calendar and kudos belong in History's
// evidence, so a peer tab was making the crew compete with the storyline for a
// nav slot. `?tab=social` still RESOLVES (see resolveActive) so no existing
// link 404s; it simply has no button of its own.
const TABS: Array<{ id: ChapterId; en: string; de: string; icon: React.ReactNode }> = [
  { id: 'today',   en: 'Today',   de: 'Heute',   icon: <Zap size={20} strokeWidth={2} /> },
  { id: 'plan',    en: 'Plan',    de: 'Plan',    icon: <CalendarDays size={20} strokeWidth={2} /> },
  { id: 'body',    en: 'Body',    de: 'Körper',  icon: <Heart size={20} strokeWidth={2} /> },
  { id: 'history', en: 'History', de: 'Verlauf', icon: <TrendingUp size={20} strokeWidth={2} /> },
]

// The bar and the chapter dots must agree, or the dots count one story and the
// buttons offer another. This can only fire from an actual source edit that
// somehow slipped past tsc and this file's own tests — a module-scope throw
// would crash the entire app bundle at import time, below any error boundary,
// for every user. console.error degrades loudly instead.
if (TABS.length !== CHAPTERS.length) {
  console.error(`seasonArc has ${CHAPTERS.length} chapters, nav has ${TABS.length} tabs`)
}

/** Old ?tab= values keep working. Retired ids map onto their new chapter
 *  rather than silently falling through to 'today', which would have sent
 *  every bookmarked /dashboard?tab=recovery link to the wrong page. */
export function resolveActive(raw: string | null): ChapterId {
  if (raw === 'plan' || raw === 'train' || raw === 'week' || raw === 'workouts') return 'plan'
  if (raw === 'body' || raw === 'recovery') return 'body'
  if (raw === 'history' || raw === 'analyze' || raw === 'trends' || raw === 'report' || raw === 'progress') return 'history'
  // Crew content now lives inside Plan and History; History is where kudos and
  // crew standing land, so that is the honest destination for a crew link.
  if (raw === 'social' || raw === 'crew') return 'history'
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
  // /progress) highlight nothing. /progress is no longer a tab of its own —
  // it is a detail page inside the History chapter, so it lights History
  // rather than a fifth slot.
  // `?tab=social`/`?tab=crew` render their OWN distinct component
  // (DashboardPage), not a chapter — resolveActive still aliases them onto
  // History for OLD-link purposes, but that must not light History's button
  // while a completely different surface is on screen.
  const rawTab = searchParams.get('tab')
  const active: ChapterId | null = location.pathname.startsWith('/progress')
    ? 'history'
    : location.pathname.startsWith('/dashboard')
      ? (rawTab === 'social' || rawTab === 'crew' ? null : resolveActive(rawTab))
      : null

  function handleTab(tab: { id: ChapterId }) {
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
