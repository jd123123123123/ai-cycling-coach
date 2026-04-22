/**
 * DashboardShell — the persistent chrome around all pages.
 *
 * Structure:
 *   <header> editorial masthead — sticky z-40 (preserved verbatim from old shell)
 *   <IconRail> fixed left sidebar — desktop only (lg+)
 *   [stickyBar] — sticky z-30, below masthead; StickyReadinessBar passes its
 *               own AnimatePresence visibility logic
 *   <main>
 *     [tabs] — scrolls with page (not sticky) — SegmentedTabs from DashboardPage
 *     {children} — tab content
 *     <footer> colophon
 *   </main>
 *   [workoutPreviewModal] — reserved slot (TrainingCalendar's portal is here)
 *   <CoachChat> — portal, opened from masthead "Ask coach" button
 *
 * Key invariants preserved from 04-01 / 05-02 / 06-03:
 *   - Masthead copy + ordering unchanged: SyncButton · LanguageToggle · Ask coach
 *   - chatOpen useState + CoachChat portal untouched (06-03 invariant)
 *   - SyncButton with 6-key invalidation unchanged
 *   - LanguageToggle unchanged
 *   - IconRail appears on desktop (lg+), hidden on mobile
 *   - Main content area offset lg:pl-14 to clear the 56px IconRail
 */
import { useEffect, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { LogOut, User as UserIcon, MessageSquare } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import CoachChat from './CoachChat'
import IconRail from './IconRail'
import LanguageToggle from './LanguageToggle'
import SyncButton from './SyncButton'
import CommandPalette from '../ui/CommandPalette'

interface DashboardShellProps {
  children: ReactNode
  /**
   * Optional sticky bar rendered between masthead and main content.
   * StickyReadinessBar manages its own AnimatePresence visibility.
   * Pass <StickyReadinessBar /> here from DashboardPage.
   */
  stickyBar?: ReactNode
  /**
   * Optional SegmentedTabs component rendered above children in main.
   * Not sticky — scrolls with the page (Apple HIG pattern).
   */
  tabs?: ReactNode
  /**
   * Reserved for workout preview modals lifted to shell level.
   * TrainingCalendar owns its own portal; this slot stays null.
   */
  workoutPreviewModal?: ReactNode
}

export default function DashboardShell({
  children,
  stickyBar,
  tabs,
  workoutPreviewModal,
}: DashboardShellProps) {
  const { user, logout } = useAuth()
  const initial = (user?.email?.[0] ?? 'A').toUpperCase()
  const [chatOpen, setChatOpen] = useState(false)
  // Task 1 (06.1-03): Cmd+K palette state + coach draft for CommandPalette → CoachChat wiring
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [coachDraft, setCoachDraft] = useState<string | undefined>(undefined)

  // Global Cmd+K (or Ctrl+K) keyboard binding — opens the palette from anywhere in the shell.
  // Binding lives here (not inside CommandPalette) so the palette cannot self-open.
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
      {/* ── Editorial masthead ─────────────────────────────────────────────────
          Preserved verbatim: copy, ordering, and styling are product-voice
          invariants. Do NOT change the masthead without a product decision. */}
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
            {/* Masthead action order (left → right): SyncButton · LanguageToggle · Ask coach. */}
            <SyncButton />
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

      {/* ── Sticky bar slot ────────────────────────────────────────────────────
          StickyReadinessBar manages its own enter/exit animation. This slot
          renders the bar component; the component itself decides visibility. */}
      {stickyBar}

      {/* ── IconRail ───────────────────────────────────────────────────────────
          Fixed left sidebar — desktop only (hidden below lg). */}
      <IconRail />

      {/* ── Main editorial flow ────────────────────────────────────────────────
          lg:pl-14 shifts content right to clear the 56px IconRail on desktop. */}
      <main className="lg:pl-14 max-w-6xl mx-auto px-4 sm:px-6 pt-6 sm:pt-8 pb-20 flex flex-col gap-6 sm:gap-8 min-w-0">
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

        {/* Tab strip — not sticky; scrolls with the page (Apple HIG) */}
        {tabs && (
          <div className="-mb-2">
            {tabs}
          </div>
        )}

        {/* Tab content */}
        <section className="min-w-0">
          {children}
        </section>

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

      {/* ── Coach chat drawer ─────────────────────────────────────────────────
          Portal — opened from masthead "Ask coach" button OR from CommandPalette.
          06-03 invariant: this state + component call must not be moved.
          Task 1 (06.1-03): initialDraft prop passes CommandPalette's onAskCoach
          question through to the composer. */}
      <CoachChat
        open={chatOpen}
        onClose={() => setChatOpen(false)}
        initialDraft={coachDraft}
      />

      {/* ── Command palette (Cmd+K) ───────────────────────────────────────────
          Task 1 (06.1-03): global Cmd+K palette. Binding is above in useEffect.
          onAskCoach seeds the CoachChat composer and opens the drawer. */}
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
