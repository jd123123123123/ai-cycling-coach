import { useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { LogOut, User as UserIcon, MessageSquare } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import CoachChat from './CoachChat'
import LanguageToggle from './LanguageToggle'

interface DashboardShellProps {
  /** Fold 1 — the headline: CoachBrief + PrescribedWorkoutCard dominates. */
  hero: ReactNode
  /** Fold 2 — compact one-row KPI strip. */
  kpiStrip: ReactNode
  /** Fold 3 — PMC chart at full width + recent activities compact list. */
  pmc: ReactNode
  /** Fold 4 — collapsed-by-default sections (biometrics detail, calendar, etc). */
  collapsedSections: ReactNode
  /** Reserved for future modals (e.g. workout preview) lifted to the shell. */
  workoutPreviewModal?: ReactNode
}

export default function DashboardShell({
  hero,
  kpiStrip,
  pmc,
  collapsedSections,
  workoutPreviewModal,
}: DashboardShellProps) {
  const { user, logout } = useAuth()
  const initial = (user?.email?.[0] ?? 'A').toUpperCase()
  const [chatOpen, setChatOpen] = useState(false)

  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--color-paper)' }}>
      {/* Editorial masthead */}
      <header
        className="sticky top-0 z-40 backdrop-blur-[6px]"
        style={{
          backgroundColor: 'rgba(243, 236, 220, 0.9)',
          borderBottom: '1px solid var(--color-rule)',
        }}
      >
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between gap-4">
          <Link
            to="/dashboard"
            className="flex items-baseline gap-3 min-w-0 group"
          >
            <span
              className="num-display leading-none tracking-tight"
              style={{
                fontSize: 'clamp(20px, 2vw, 26px)',
                color: 'var(--color-ink)',
                fontVariationSettings: '"opsz" 72, "SOFT" 100',
              }}
            >
              The Coach
            </span>
            <span
              className="eyebrow hidden sm:inline"
              style={{ color: 'var(--color-amber)', letterSpacing: '0.2em' }}
            >
              Daily · est. 2026
            </span>
          </Link>
          <div className="flex items-center gap-2">
            {/* Masthead action order (left → right): SyncButton · LanguageToggle · Ask coach.
               SyncButton is inserted in the same task as LanguageToggle below. */}
            <LanguageToggle />
            <button
              onClick={() => setChatOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-full text-[12px] font-medium transition-all min-h-[40px] hover:-translate-y-0.5"
              style={{
                color: 'var(--color-paper)',
                backgroundColor: 'var(--color-ink)',
                border: '1px solid var(--color-ink)',
              }}
              aria-label="Ask coach"
              title="Open coach chat"
            >
              <MessageSquare size={13} strokeWidth={1.8} />
              <span>Ask coach</span>
            </button>
            <div
              className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-full"
              style={{
                backgroundColor: 'var(--color-paper-2)',
                border: '1px solid var(--color-rule)',
              }}
            >
              <div
                className="w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-semibold"
                style={{
                  backgroundColor: 'var(--color-forest)',
                  color: 'var(--color-paper)',
                }}
                aria-hidden
              >
                {initial}
              </div>
              <span
                className="text-[12px] truncate max-w-[180px] dashboard-break-words"
                style={{ color: 'var(--color-ink-2)' }}
              >
                {user?.email}
              </span>
            </div>
            <button
              onClick={() => { void logout() }}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-full text-[12px] font-medium transition-colors min-h-[40px]"
              style={{
                color: 'var(--color-ink-2)',
                border: '1px solid var(--color-rule)',
                backgroundColor: 'transparent',
              }}
              aria-label="Sign out"
              title="Sign out"
            >
              <LogOut size={13} strokeWidth={1.8} />
              <span className="hidden sm:inline">Sign out</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main editorial flow — 4 folds with progressive disclosure */}
      <main className="max-w-6xl mx-auto px-4 sm:px-6 pt-6 sm:pt-8 pb-20 flex flex-col gap-6 sm:gap-8 min-w-0">
        {/* Masthead supra — newspaper-style dateline */}
        <div className="flex items-center gap-3 -mb-2">
          <UserIcon size={12} strokeWidth={1.8} style={{ color: 'var(--color-forest)' }} />
          <span className="eyebrow" style={{ color: 'var(--color-forest)' }}>
            Today&apos;s briefing
          </span>
          <span
            className="flex-1 h-px"
            style={{ backgroundColor: 'var(--color-rule)' }}
            aria-hidden
          />
        </div>

        {/* Fold 1 — the hero. CoachBrief + PrescribedWorkoutCard. */}
        <section data-testid="hero-section" className="min-w-0">
          {hero}
        </section>

        {/* Fold 2 — compact KPI strip */}
        <section data-testid="kpi-strip-section" className="min-w-0">
          {kpiStrip}
        </section>

        {/* Fold 3 — PMC + recent activities, full width */}
        <section data-testid="pmc-section" className="min-w-0 flex flex-col gap-6">
          {pmc}
        </section>

        {/* Fold 4 — progressively disclosed sections */}
        <div data-testid="collapsed-sections" className="min-w-0 flex flex-col">
          {collapsedSections}
        </div>

        {/* Colophon */}
        <footer
          className="pt-6 flex items-center justify-between gap-3 flex-wrap mt-4"
          style={{ borderTop: '1px solid var(--color-rule)' }}
        >
          <span className="eyebrow" style={{ color: 'var(--color-muted)' }}>
            Vol. I · Dashboard
          </span>
          <span className="num-mono text-[11px]" style={{ color: 'var(--color-muted)' }}>
            Powered by sports science + your Garmin
          </span>
        </footer>
      </main>

      {workoutPreviewModal}

      {/* Coach chat drawer — portal, opened from masthead */}
      <CoachChat open={chatOpen} onClose={() => setChatOpen(false)} />
    </div>
  )
}
