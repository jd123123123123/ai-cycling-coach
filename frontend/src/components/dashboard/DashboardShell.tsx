import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'

interface DashboardShellProps {
  bodyStatus: ReactNode
  pmc: ReactNode          // filled by plan 04-02
  calendar: ReactNode     // filled by plan 04-03
  workoutPreviewModal?: ReactNode  // filled by plan 04-04
}

export default function DashboardShell({
  bodyStatus, pmc, calendar, workoutPreviewModal,
}: DashboardShellProps) {
  const { user, logout } = useAuth()
  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white border-b border-gray-200">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
          <Link to="/dashboard" className="font-semibold text-gray-900">AI Cycling Coach</Link>
          <div className="flex items-center gap-3 text-sm text-gray-500">
            <span className="hidden sm:inline truncate max-w-[160px]">{user?.email}</span>
            <button
              onClick={() => { void logout() }}
              className="hover:text-gray-700 font-medium transition-colors"
            >
              Sign out
            </button>
          </div>
        </div>
      </nav>

      {/* min-w-0 on flex/grid children is required so Recharts ResponsiveContainer
          (used in plan 04-02) renders at width > 0. Keep it. */}
      <main className="max-w-5xl mx-auto px-4 py-6 sm:py-8 flex flex-col gap-6 min-w-0">
        <section data-testid="body-status-section" className="min-w-0">
          {bodyStatus}
        </section>
        <section data-testid="pmc-section" className="min-w-0">
          {pmc}
        </section>
        <section data-testid="calendar-section" className="min-w-0">
          {calendar}
        </section>
      </main>

      {workoutPreviewModal}
    </div>
  )
}
