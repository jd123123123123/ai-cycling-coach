import { useEffect, useState } from 'react'
import CoachBrief from './CoachBrief'
import WeekStrip from './WeekStrip'
import StreakCard from './StreakCard'
import WeeklySportMetrics from './WeeklySportMetrics'
import ComplianceStrip from './ComplianceStrip'
import LastWeekRecap from './LastWeekRecap'
import PolarizedDistribution from './PolarizedDistribution'
import { prefersReducedMotion } from '../../utils/motion'

// Tab-based composition for the dashboard's secondary surface. Hero stays
// above (always-on); below it the user picks the frame: today / week / form.
// This is the 2026-era pattern shared by Whoop's "Today / Strain / Recovery"
// and Strava's post-redesign feed — one scroll per frame, not one scroll
// for everything. Tab selection persists via localStorage so returning
// visits don't reset the user's chosen view.

const TABS = [
  { key: 'today', label: 'Today', hint: 'your body · your prescription' },
  { key: 'week', label: 'Week', hint: 'what you did · what you planned' },
  { key: 'form', label: 'Form', hint: 'distribution · grade' },
] as const

type TabKey = (typeof TABS)[number]['key']

const STORAGE_KEY = 'dashboard-tab'

function loadInitial(): TabKey {
  try {
    const v = window.localStorage.getItem(STORAGE_KEY)
    if (v === 'today' || v === 'week' || v === 'form') return v
  } catch {
    /* ignore */
  }
  return 'today'
}

export default function DashboardTabs() {
  const [tab, setTab] = useState<TabKey>(() => {
    if (typeof window === 'undefined') return 'today'
    return loadInitial()
  })

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, tab)
    } catch {
      /* ignore */
    }
  }, [tab])

  const reduceMotion = prefersReducedMotion()

  return (
    <div className="flex flex-col gap-4">
      {/* Tab bar — premium segmented control. Active pill is ink-filled,
         inactive shows on hover. The hint text appears only on the active
         tab so the bar reads as a label strip, not a data-dense row. */}
      <div
        className="sticky z-10 flex items-center gap-1 rounded-full px-1 py-1"
        style={{
          top: 12,
          backgroundColor: 'color-mix(in srgb, var(--color-paper-2) 94%, transparent)',
          border: '1px solid var(--color-rule)',
          backdropFilter: 'saturate(1.4) blur(16px)',
          WebkitBackdropFilter: 'saturate(1.4) blur(16px)',
          boxShadow: '0 2px 8px rgba(0,0,0,0.05)',
        }}
      >
        <div
          className="relative flex flex-1"
          role="tablist"
          aria-label="Dashboard section"
        >
          {TABS.map((t) => {
            const active = t.key === tab
            return (
              <button
                key={t.key}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setTab(t.key)}
                className="relative flex-1 flex flex-col items-center justify-center gap-0.5 py-2 px-3 rounded-full"
                style={{
                  color: active ? 'var(--color-paper)' : 'var(--color-ink-2)',
                  fontWeight: active ? 500 : 400,
                  backgroundColor: active
                    ? 'var(--color-ink)'
                    : 'transparent',
                  boxShadow: active
                    ? '0 1px 4px rgba(0,0,0,0.50), inset 0 1px 0 rgba(255,255,255,0.10)'
                    : undefined,
                  transition: reduceMotion
                    ? 'none'
                    : 'color 200ms ease, background-color 240ms cubic-bezier(.22,1,.36,1), box-shadow 240ms ease',
                  minHeight: 40,
                }}
              >
                <span className="text-[13px] leading-none">{t.label}</span>
                {active && (
                  <span
                    className="text-[9px] leading-none tracking-wide"
                    style={{
                      color: 'rgba(255,255,255,0.45)',
                      animation: reduceMotion ? undefined : 'fade-in 200ms ease-out both',
                    }}
                  >
                    {t.hint}
                  </span>
                )}
              </button>
            )
          })}
        </div>
      </div>

      {/* Panel content. We render only the active panel so heavy children
         (query-backed cards) don't all fetch in parallel — the user pays
         the cost of the tab they're actually looking at. */}
      <div
        key={tab}
        className="flex flex-col gap-4"
        style={
          reduceMotion
            ? undefined
            : {
                animation:
                  'tabpanel-in 360ms cubic-bezier(.22,1,.36,1) both',
              }
        }
      >
        {tab === 'today' && (
          <>
            <CoachBrief />
          </>
        )}

        {tab === 'week' && (
          <>
            <div className="grid gap-4 md:grid-cols-[1.6fr_1fr]">
              <WeekStrip />
              <StreakCard />
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <ComplianceStrip />
              <LastWeekRecap />
            </div>
            <WeeklySportMetrics />
          </>
        )}

        {tab === 'form' && (
          <>
            <PolarizedDistribution />
          </>
        )}
      </div>

      {!reduceMotion && (
        <style>{`
          @keyframes tabpanel-in {
            0%   { opacity: 0; transform: translateY(4px); }
            100% { opacity: 1; transform: translateY(0); }
          }
        `}</style>
      )}
    </div>
  )
}
