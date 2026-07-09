import { useSearchParams } from 'react-router-dom'
import { Sun, CalendarDays, BarChart3 } from 'lucide-react'
import { useT, useLocale } from '../../contexts/LocaleContext'

// Mobile bottom navigation — your thumb can't reach a top tab strip on a
// phone. Appears only below 'lg'. Mirrors the three desktop surfaces:
// Today (the call) · Plan (week + workouts) · Analyze (all evidence).

type TabId = 'today' | 'plan' | 'analyze'

const TABS: Array<{ id: TabId; labelKey: 'tab_today' | 'tab_plan' | 'tab_analyze'; icon: React.ReactNode }> = [
  { id: 'today',   labelKey: 'tab_today',   icon: <Sun size={20} strokeWidth={1.8} /> },
  { id: 'plan',    labelKey: 'tab_plan',    icon: <CalendarDays size={20} strokeWidth={1.8} /> },
  { id: 'analyze', labelKey: 'tab_analyze', icon: <BarChart3 size={20} strokeWidth={1.8} /> },
]

function resolveActive(raw: string | null): TabId {
  if (raw === 'plan' || raw === 'train' || raw === 'week' || raw === 'workouts') return 'plan'
  if (raw === 'analyze' || raw === 'trends' || raw === 'report') return 'analyze'
  return 'today'
}

export default function MobileBottomNav() {
  const [searchParams, setSearchParams] = useSearchParams()
  const t = useT()
  const { locale } = useLocale()
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
      aria-label={locale === 'de' ? 'Hauptnavigation' : 'Main navigation'}
    >
      {TABS.map(({ id, labelKey, icon }) => {
        const isActive = id === active
        const label = t(labelKey)
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
