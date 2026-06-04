import { useSearchParams } from 'react-router-dom'
import { Sun, CalendarDays, LineChart, Users, Award } from 'lucide-react'

// Mobile bottom navigation — your thumb can't reach a top tab strip on a
// phone. Apple HIG / Strava / Whoop / Garmin Connect all use bottom nav on
// mobile. Appears only below 'lg'. Mirrors the four desktop surfaces:
// Today (verdict) · Train (plan) · Trends (evidence) · Crew (squad cup).

type TabId = 'today' | 'train' | 'trends' | 'crew' | 'report'

const TABS: Array<{ id: TabId; label: string; icon: React.ReactNode }> = [
  { id: 'today',  label: 'Today',  icon: <Sun size={20} strokeWidth={1.8} /> },
  { id: 'train',  label: 'Train',  icon: <CalendarDays size={20} strokeWidth={1.8} /> },
  { id: 'trends', label: 'Trends', icon: <LineChart size={20} strokeWidth={1.8} /> },
  { id: 'crew',   label: 'Crew',   icon: <Users size={20} strokeWidth={1.8} /> },
  { id: 'report', label: 'Report', icon: <Award size={20} strokeWidth={1.8} /> },
]

function resolveActive(raw: string | null): TabId {
  if (raw === 'train' || raw === 'week') return 'train'
  if (raw === 'trends') return 'trends'
  if (raw === 'crew') return 'crew'
  if (raw === 'report') return 'report'
  return 'today'
}

export default function MobileBottomNav() {
  const [searchParams, setSearchParams] = useSearchParams()
  const active = resolveActive(searchParams.get('tab'))

  function handleTab(id: TabId) {
    setSearchParams({ tab: id }, { replace: true })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  return (
    <nav
      className="lg:hidden fixed bottom-0 inset-x-0 z-40 flex items-stretch"
      style={{
        backgroundColor: 'color-mix(in srgb, var(--color-paper-2) 92%, transparent)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        borderTop: '1px solid var(--color-rule)',
        paddingBottom: 'env(safe-area-inset-bottom)',
      }}
      aria-label="Main navigation"
    >
      {TABS.map(({ id, label, icon }) => {
        const isActive = id === active
        return (
          <button
            key={id}
            type="button"
            onClick={() => handleTab(id)}
            className="flex-1 flex flex-col items-center justify-center py-2 gap-0.5 transition-colors"
            style={{ color: isActive ? 'var(--color-ink)' : 'var(--color-muted)', minHeight: 56 }}
            aria-current={isActive ? 'page' : undefined}
            aria-label={label}
          >
            <div
              className="relative flex items-center justify-center transition-all"
              style={{
                color: isActive ? 'var(--color-good)' : 'var(--color-muted)',
                transform: isActive ? 'translateY(-1px)' : 'none',
                transition: 'transform 200ms ease, color 200ms ease',
              }}
            >
              {icon}
              {isActive && (
                <span
                  className="absolute -bottom-1.5 w-1 h-1 rounded-full"
                  style={{ backgroundColor: 'var(--color-good)' }}
                />
              )}
            </div>
            <span
              className="eyebrow"
              style={{
                fontSize: 9,
                letterSpacing: '0.14em',
                fontWeight: isActive ? 600 : 400,
                color: isActive ? 'var(--color-ink)' : 'var(--color-muted)',
                marginTop: 4,
              }}
            >
              {label.toUpperCase()}
            </span>
          </button>
        )
      })}
    </nav>
  )
}
