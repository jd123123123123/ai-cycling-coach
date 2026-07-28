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
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import CoachChat from './CoachChat'
import CommandPalette from '../ui/CommandPalette'
import MobileBottomNav from './MobileBottomNav'
import DashboardHeaderBar from './DashboardHeaderBar'
import CoachFab from './CoachFab'
import ShaderCanvas from '../wrapped/ShaderCanvas'
import TodayRoad, { type TodayRoadHandle } from './today/TodayRoad'
import RoadHud from './today/RoadHud'
import { AuraContext, type RoadPayload } from './AuraContext'
import type { RoadProfile } from '../../utils/roadProfile'
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
 *
 * UNENFORCED INVARIANT — read this before adding a new dashboard card:
 * the inline-background fallback above only works because no card in
 * dashboard/* paints its surface with a Tailwind `bg-*` class. Nothing in
 * the type system or a lint rule guards this. A future card styled with
 * `className="bg-..."` and NOT carrying `data-glass-card` becomes silent
 * scrub-start territory: this shell takes pointer capture on that
 * pointerdown, so the card's own click is retargeted to `<main>` and lost —
 * no error, no warning, just a card that quietly stops responding to taps.
 * Any new card MUST paint its surface via inline `style` (matching the rest
 * of dashboard/*) OR carry `{...GLASS_CARD_MARKER}` / a manually-added
 * `data-glass-card="true"`. `DashboardShell.test.tsx` pins the `<button>` and
 * `data-glass-card` cases so a regression there fails a test, but it cannot
 * catch a brand-new card that violates the invariant — that part is still on
 * code review.
 */
/**
 * Has the day's road profile changed identity since the last render?
 *
 * Both sides MUST be normalized to null: `road?.profile` is `undefined` when
 * there is no road, whereas the stored value is `?? null`. Comparing them raw
 * is true forever, which turns the render-phase state adjustment below into an
 * infinite re-render — React gives render-phase updates no equality bailout,
 * so it climbs to the re-render limit and throws into the ErrorBoundary.
 * (Production incident, 2026-07-27.)
 */
export function roadProfileChanged(
  road: RoadPayload | null | undefined,
  lastProfile: RoadProfile | null,
): boolean {
  return (road?.profile ?? null) !== lastProfile
}

const INTERACTIVE_TAGS = new Set(['BUTTON', 'A', 'INPUT', 'TEXTAREA', 'SELECT'])
export function isOnCardOrControl(target: EventTarget | null, boundary: HTMLElement | null): boolean {
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
  // BOTH sides must be normalized to null. `road?.profile` is `undefined` when
  // there is no road, while `lastProfile` stores `?? null` — so comparing them
  // raw was true on EVERY render, the render-phase setState never converged,
  // and React threw "Too many re-renders" into the top-level ErrorBoundary.
  // Render-phase updates get no equality bailout, so this never self-corrects.
  // Pure + exported so the invariant is pinned by roadProfileChanged.test.ts.
  const currentProfile = road?.profile ?? null
  const [lastProfile, setLastProfile] = useState(currentProfile)
  if (roadProfileChanged(road, lastProfile)) {
    setLastProfile(currentProfile)
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

  // Both setters are useCallback([]) (stable across the shell's lifetime), so
  // this memo genuinely holds — without it, `travel` updating every animation
  // frame during a scrub (it's state on THIS component) would recreate the
  // context value object every frame, defeating React's element-identity
  // bailout for {children} and re-rendering the entire useAura() consumer
  // tree (TodayTab + ~12 cards and all their hooks) at 60fps alongside the
  // WebGL render loop.
  const auraContextValue = useMemo(() => ({ setAura, setRoad }), [setAura, setRoad])

  return (
    <AuraContext.Provider value={auraContextValue}>
    <div className="min-h-screen" style={{ backgroundColor: 'var(--color-paper)' }}>
      {stickyBar}

      <main
        ref={mainRef}
        className="paper-grain max-w-md mx-auto px-4 pb-28 flex flex-col gap-6 min-w-0 relative isolate"
        // 'pan-y pinch-zoom' (not bare 'pan-y'): pan-y alone permits vertical
        // panning but disables pinch-zoom entirely (WCAG 1.4.4) across the
        // whole page whenever a road is mounted. Adding pinch-zoom back to
        // the touch-action value list (valid grammar: touch-action accepts a
        // space-separated combination of pan-x/pan-y/pinch-zoom) restores
        // zoom while the scrub gesture (a single-finger drag, not a pinch)
        // keeps working exactly as before.
        style={{ touchAction: road ? 'pan-y pinch-zoom' : undefined }}
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
          // `fixed`, not `absolute`. Absolute inside <main> stretched the canvas
          // over main's FULL scroll height — ~2500px on Today — so the shader's
          // bloom, positioned at 30% of the canvas, landed roughly 750px down
          // the document instead of behind the readiness ring, and every card
          // on the page sat inside the tinted field. Fixing it to the viewport
          // puts the light where the ring is and lets content scroll THROUGH
          // it, which is also what the road layer above already does — the two
          // backdrops no longer parallax differently when the state flips.
          <ShaderCanvas
            variant="aura"
            uniforms={{ u_aura: aura, u_bg: '#0A0C0F' }}
            style={{ position: 'fixed', inset: 0, width: '100%', height: '100%', zIndex: -1, pointerEvents: 'none' }}
          />
        )}

        <DashboardHeaderBar />

        {/* Today's Road's accessible + textual surface (finding 2): the
            canvas/SVG terrain is aria-hidden, so this is what a screen
            reader gets and what a scrubbing athlete actually reads —
            elapsed/watts/zone/RPE under the scrub position, plus the
            honest matches readout ("—" / "matches unknown" when CP is
            unknown). `position: sticky` (inside RoadHud) keeps it on-screen
            while scrolled, since a drag can start anywhere the delegated
            listener above reaches, not just near the top of the page.
            Mounting/absence/travel-passthrough is unit-tested directly on
            RoadHud (today/__tests__/RoadHud.test.tsx) rather than through
            this whole shell. */}
        <RoadHud road={road} travel={travel} de={de} />

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
