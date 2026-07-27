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
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import CoachChat from './CoachChat'
import CommandPalette from '../ui/CommandPalette'
import MobileBottomNav from './MobileBottomNav'
import DashboardHeaderBar from './DashboardHeaderBar'
import CoachFab from './CoachFab'
import ShaderCanvas from '../wrapped/ShaderCanvas'
import TodayRoad, { type TodayRoadHandle } from './today/TodayRoad'
import RoadReadout from './today/RoadReadout'
import { AuraContext, type RoadPayload } from './AuraContext'
import { glassCardStyle } from './glassCard'
import { useLocale } from '../../contexts/LocaleContext'

interface DashboardShellProps {
  children: ReactNode
  stickyBar?: ReactNode
  workoutPreviewModal?: ReactNode
}

/**
 * "Is this pointerdown on a card (or an interactive control), or on empty
 * page?" — the question DashboardShell's delegated scrub listener needs to
 * answer on every pointerdown (see the onPointerDown handler below for the
 * full rationale). Walks from the event target up to (and including)
 * `boundary`, stopping at the first element that is either a native
 * interactive control or carries an explicit inline background — which,
 * in this codebase, is how EVERY card/chip/button paints itself (no
 * Tailwind `bg-*` utilities are used for card surfaces anywhere in
 * dashboard/*). An element with no such ancestor is empty page: the flex
 * `gap-6` seams, `px-4` gutters, `pb-28` tail, and anywhere a card doesn't
 * reach. `data-glass-card` (set by every glass-card consumer of
 * `glassCard.ts`) is checked first as the fast, explicit path.
 */
const INTERACTIVE_TAGS = new Set(['BUTTON', 'A', 'INPUT', 'TEXTAREA', 'SELECT'])
function isOnCardOrControl(target: EventTarget | null, boundary: HTMLElement | null): boolean {
  let el = target as HTMLElement | null
  while (el) {
    if (el.dataset?.glassCard === 'true') return true
    if (INTERACTIVE_TAGS.has(el.tagName) || el.getAttribute('role') === 'button') return true
    if (el.style && (el.style.background || el.style.backgroundColor || el.style.backgroundImage)) return true
    if (el === boundary) return false
    el = el.parentElement
  }
  return false
}

export default function DashboardShell({
  children,
  stickyBar,
  workoutPreviewModal,
}: DashboardShellProps) {
  const { locale } = useLocale()
  const de = locale === 'de'
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
  // Current scrub position (0..1), driven by <TodayRoad>'s onTravel — either
  // from its own internal pointer handling or from the delegated gesture
  // below — and read by <RoadReadout>, the road's accessible surface.
  const [travel, setTravel] = useState(0)

  const mainRef = useRef<HTMLDivElement>(null)
  const roadWrapperRef = useRef<HTMLDivElement>(null)
  const roadRef = useRef<TodayRoadHandle>(null)
  const scrubPointerIdRef = useRef<number | null>(null)
  const pendingTravelRef = useRef(0)
  const scrubRafRef = useRef(0)

  // Reset the scrub readout whenever the day's road payload changes shape
  // (new session, mode change) — travel=0 (start of session) is the correct
  // default for a road nobody has touched yet, and the old position could
  // otherwise point mid-way into a completely different session's terrain.
  // Adjusted DURING RENDER (React's own "adjusting state when a prop
  // changes" pattern — react.dev/learn/you-might-not-need-an-effect), not in
  // a useEffect: `road.profile`'s identity is already stable across
  // incidental re-renders (TodayTab memoizes it), so comparing references
  // here is exactly as reliable as an effect dependency array would be,
  // without the extra render-then-cascade an effect would cost.
  const [lastProfile, setLastProfile] = useState(road?.profile ?? null)
  if (road?.profile !== lastProfile) {
    setLastProfile(road?.profile ?? null)
    if (travel !== 0) setTravel(0)
  }

  const publishScrub = useCallback(() => {
    scrubRafRef.current = 0
    roadRef.current?.scrubTo(pendingTravelRef.current)
  }, [])

  /**
   * The road's own hitbox (inside TodayRoad, z-index -1) only ever receives
   * a REAL pointer event in the thin strips where no card paints over it —
   * see the zIndex comment on the road wrapper below. Everywhere else (which
   * on a card-dense 390px screen is most of the page) the browser dispatches
   * the pointerdown to whatever card is actually on top. Attaching this
   * listener to <main> instead sidesteps hit-testing entirely: pointer
   * events bubble up the DOM tree to every ancestor regardless of who was
   * hit-tested as the topmost paint target, so <main> sees every pointerdown
   * that happens anywhere inside it, including on top of a card.
   *
   * Trade-off (finding 1): a full-bleed listener at higher z-index than the
   * cards would receive every pointer, including taps meant for a card's own
   * button/link — that would make cards untappable, the opposite of what's
   * wanted. `isOnCardOrControl` resolves this by inspecting the ORIGINAL
   * target's ancestry: if the gesture started on a card (or a native control
   * inside one), this listener does nothing at all — no preventDefault, no
   * stopPropagation — so the card's own click/link/scroll behaviour is
   * completely untouched. Only a gesture that starts on truly empty page
   * (the flex gaps, gutters, and page tail, or the visible sliver of
   * terrain the road itself paints through) begins a scrub.
   */
  const onMainPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!road) return
    if (isOnCardOrControl(e.target, mainRef.current)) return
    const wrapper = roadWrapperRef.current
    if (!wrapper) return
    const rect = wrapper.getBoundingClientRect()
    if (rect.width <= 0) return
    scrubPointerIdRef.current = e.pointerId
    e.currentTarget.setPointerCapture?.(e.pointerId)
    pendingTravelRef.current = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width))
    if (!scrubRafRef.current) scrubRafRef.current = requestAnimationFrame(publishScrub)
  }, [road, publishScrub])

  const onMainPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (scrubPointerIdRef.current !== e.pointerId || e.buttons <= 0) return
    const wrapper = roadWrapperRef.current
    if (!wrapper) return
    const rect = wrapper.getBoundingClientRect()
    if (rect.width <= 0) return
    pendingTravelRef.current = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width))
    if (!scrubRafRef.current) scrubRafRef.current = requestAnimationFrame(publishScrub)
  }, [publishScrub])

  const endMainScrub = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (scrubPointerIdRef.current !== e.pointerId) return
    scrubPointerIdRef.current = null
    if (e.currentTarget.hasPointerCapture?.(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId)
    }
  }, [])

  useEffect(() => () => { if (scrubRafRef.current) cancelAnimationFrame(scrubRafRef.current) }, [])

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

      <main
        ref={mainRef}
        className="paper-grain max-w-md mx-auto px-4 pb-28 flex flex-col gap-6 min-w-0 relative isolate"
        style={{ touchAction: road ? 'pan-y' : undefined }}
        onPointerDown={onMainPointerDown}
        onPointerMove={onMainPointerMove}
        onPointerUp={endMainScrub}
        onPointerCancel={endMainScrub}
      >
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
          // all in-flow content. pointerEvents stays 'auto' so TodayRoad's
          // own internal drag handling still works directly in the thin
          // strips where it IS the topmost paint target; the delegated
          // onPointerDown/Move/Up above on <main> is what makes the gesture
          // reachable everywhere else (over and around cards).
          <div ref={roadWrapperRef} style={{ position: 'fixed', inset: 0, zIndex: -1, pointerEvents: 'auto' }}>
            <TodayRoad ref={roadRef} profile={road.profile} mode={road.mode} auraColor={road.color} onTravel={setTravel} />
          </div>
        ) : aura && (
          <ShaderCanvas
            variant="aura"
            uniforms={{ u_aura: aura, u_bg: '#0A0C0F' }}
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', zIndex: -1, pointerEvents: 'none' }}
          />
        )}

        <DashboardHeaderBar />

        {/* Today's Road's accessible + textual surface (finding 2): the
            canvas/SVG terrain is aria-hidden, so this is what a screen
            reader gets and what a scrubbing athlete actually reads —
            elapsed/watts/zone/RPE under the scrub position, plus the
            honest matches readout ("—" / "matches unknown" when CP is
            unknown). `position: sticky` keeps it on-screen while scrolled,
            since a drag can start anywhere the delegated listener above
            reaches, not just near the top of the page. */}
        {road && road.profile.samples.length > 0 && (
          <div
            className="rounded-full px-4 py-2"
            style={{ ...glassCardStyle, position: 'sticky', top: 8, zIndex: 5, alignSelf: 'flex-start' }}
          >
            <RoadReadout profile={road.profile} blocks={road.blocks} travel={travel} de={de} />
          </div>
        )}

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
