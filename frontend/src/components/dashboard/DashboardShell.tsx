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
import { useCallback, useEffect, useState, type ReactNode } from 'react'
import CoachChat from './CoachChat'
import CommandPalette from '../ui/CommandPalette'
import MobileBottomNav from './MobileBottomNav'
import DashboardHeaderBar from './DashboardHeaderBar'
import CoachFab from './CoachFab'
import ShaderCanvas from '../wrapped/ShaderCanvas'
import TodayRoad from './today/TodayRoad'
import { AuraContext, type RoadPayload } from './AuraContext'

interface DashboardShellProps {
  children: ReactNode
  stickyBar?: ReactNode
  workoutPreviewModal?: ReactNode
}

export default function DashboardShell({
  children,
  stickyBar,
  workoutPreviewModal,
}: DashboardShellProps) {
  const [chatOpen, setChatOpen] = useState(false)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [coachDraft, setCoachDraft] = useState<string | undefined>(undefined)
  // The Today flagship publishes its state-keyed aura colour here; the shell
  // paints it full-screen behind <main> (header bar included). Null on every
  // other tab → no aura. Stable setter so consumers' effects don't re-run.
  const [aura, setAuraState] = useState<string | null>(null)
  const setAura = useCallback((c: string | null) => setAuraState(c), [])
  // The day's road (Today's Road), when the Today tab has published one.
  // Wins over the plain aura backdrop when present. Stable setter for the
  // same reason as setAura above.
  const [road, setRoadState] = useState<RoadPayload | null>(null)
  const setRoad = useCallback((r: RoadPayload | null) => setRoadState(r), [])

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
    <AuraContext.Provider value={{ setAura, setRoad }}>
    <div className="min-h-screen" style={{ backgroundColor: 'var(--color-paper)' }}>
      {stickyBar}

      <main className="paper-grain max-w-md mx-auto px-4 pb-28 flex flex-col gap-6 min-w-0 relative isolate">
        {/* Flagship readiness aura — full-screen backdrop behind ALL of main
            (header bar + tab content), matching the pen. Only present when the
            Today tab has published a colour; freezes under reduced-motion and
            pauses offscreen (ShaderCanvas contract). */}
        {road ? (
          // zIndex: -1 (not 0) is deliberate: DashboardHeaderBar and the tab
          // content below are non-positioned (position: static), so per CSS
          // painting order a fixed z-index:0 layer would paint ON TOP of them
          // (step 6 beats step 3), inverting the "cards over the road" glass
          // treatment. -1 matches the old aura backdrop's convention — behind
          // all in-flow content — while pointerEvents stays 'auto' so drag-to-
          // scrub still works in the gaps around the (opaque-enough) cards.
          <div style={{ position: 'fixed', inset: 0, zIndex: -1, pointerEvents: 'auto' }}>
            <TodayRoad profile={road.profile} mode={road.mode} auraColor={road.color} />
          </div>
        ) : aura && (
          <ShaderCanvas
            variant="aura"
            uniforms={{ u_aura: aura, u_bg: '#0A0C0F' }}
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', zIndex: -1, pointerEvents: 'none' }}
          />
        )}

        <DashboardHeaderBar />

        <section className="min-w-0">
          {children}
        </section>
      </main>

      <MobileBottomNav />

      {/* Always-reachable AI coach (mobile) — the palette (Cmd+K) is desktop-only. */}
      <CoachFab onOpen={() => setChatOpen(true)} />

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
    </AuraContext.Provider>
  )
}
