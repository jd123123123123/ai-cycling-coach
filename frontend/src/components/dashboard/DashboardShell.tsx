import { useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { LogOut, User as UserIcon, MessageSquare } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import CoachChat from './CoachChat'

interface DashboardShellProps {
  bodyStatus: ReactNode
  pmc: ReactNode              // plan 04-02 mounts PMCChart
  calendar: ReactNode          // plan 04-03 mounts TrainingCalendar (and RecentActivities alongside)
  workoutPreviewModal?: ReactNode  // reserved — modal lives in portal from TrainingCalendar
}

export default function DashboardShell({
  bodyStatus, pmc, calendar, workoutPreviewModal,
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

      {/* Main editorial flow */}
      <main className="max-w-6xl mx-auto px-4 sm:px-6 pt-8 sm:pt-12 pb-20 flex flex-col gap-10 sm:gap-14 min-w-0">
        {/* Masthead supra — a newspaper-style dateline */}
        <div className="flex items-center gap-3 -mb-4">
          <UserIcon size={12} strokeWidth={1.8} style={{ color: 'var(--color-forest)' }} />
          <span
            className="eyebrow"
            style={{ color: 'var(--color-forest)' }}
          >
            Today&apos;s briefing
          </span>
          <span
            className="flex-1 h-px"
            style={{ backgroundColor: 'var(--color-rule)' }}
            aria-hidden
          />
        </div>

        <section data-testid="body-status-section" className="min-w-0">
          {bodyStatus}
        </section>

        <section data-testid="pmc-section" className="min-w-0 flex flex-col gap-6">
          {pmc}
        </section>

        <section data-testid="calendar-section" className="min-w-0">
          {calendar}
        </section>

        {/* Colophon */}
        <footer
          className="pt-6 flex items-center justify-between gap-3 flex-wrap"
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
