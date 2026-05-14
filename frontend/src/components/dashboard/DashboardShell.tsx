/**
 * DashboardShell — minimal chrome.
 *
 * Structure:
 *   [stickyBar]       — sticky z-30; StickyReadinessBar manages own visibility
 *   <main>
 *     [tabs]          — SegmentedTabs from DashboardPage (not sticky)
 *     {children}      — tab content
 *   </main>
 *   <MobileBottomNav> — thumb-reach nav, hidden ≥ lg
 *   [workoutPreviewModal]
 *   <CoachChat>       — portal, opened via Cmd+K palette
 *   <CommandPalette>  — Cmd+K launcher (onAskCoach → opens CoachChat)
 *
 * The previous masthead + left IconRail were removed per product decision
 * to maximize content density. CoachChat is still reachable via Cmd+K.
 */
import { useEffect, useState, type ReactNode } from 'react'
import CoachChat from './CoachChat'
import CommandPalette from '../ui/CommandPalette'
import MobileBottomNav from './MobileBottomNav'
import SyncButton from './SyncButton'
import LocaleSwitch from './LocaleSwitch'

interface DashboardShellProps {
  children: ReactNode
  stickyBar?: ReactNode
  tabs?: ReactNode
  workoutPreviewModal?: ReactNode
}

export default function DashboardShell({
  children,
  stickyBar,
  tabs,
  workoutPreviewModal,
}: DashboardShellProps) {
  const [chatOpen, setChatOpen] = useState(false)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [coachDraft, setCoachDraft] = useState<string | undefined>(undefined)

  // Cmd+K (or Ctrl+K) — command palette
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setPaletteOpen(true)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--color-paper)' }}>
      {stickyBar}

      <main className="paper-grain max-w-6xl mx-auto px-4 sm:px-6 pb-28 lg:pb-20 flex flex-col gap-6 sm:gap-8 min-w-0">
        <div className="flex justify-end items-center gap-2 pt-3">
          <LocaleSwitch />
          <SyncButton compact />
        </div>

        {tabs && <div className="-mb-2">{tabs}</div>}

        <section className="min-w-0">
          {children}
        </section>
      </main>

      <MobileBottomNav />

      {workoutPreviewModal}

      <CoachChat
        open={chatOpen}
        onClose={() => setChatOpen(false)}
        initialDraft={coachDraft}
      />

      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        onAskCoach={(q) => {
          setCoachDraft(q)
          setChatOpen(true)
          setPaletteOpen(false)
        }}
      />
    </div>
  )
}
