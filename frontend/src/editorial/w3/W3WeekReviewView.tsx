import { useCallback, useEffect, useRef, useState } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import {
  X, Bike, Timer, Route as RouteIcon, Mountain, Gauge, CalendarCheck,
  TrendingUp, TrendingDown, Minus, Trophy, ArrowRight, Coins, Target,
  CalendarDays, Layers,
} from 'lucide-react'
import { T, FONT, EASE, DASH } from './w3tokens'
import './w3.css'
import W3StatusBar from './W3StatusBar'

/**
 * W3 · WOCHENRÜCKBLICK — the start-of-week moment, as THREE screen-sized pages.
 *
 *   1 · LETZTE WOCHE — what actually happened. The week's real TSS against the
 *       plan it was measured by, the four figures, the shape of the seven days,
 *       and what it moved.
 *   2 · DIESE WOCHE — the target, the ramp it sits on, and the levers that
 *       chose it, as a grid rather than a column of prose.
 *   3 · DER PLAN — the seven days as prescribed, and the way into them.
 *
 * ── WHY PAGES AND NOT A SCROLL ───────────────────────────────────────────
 *
 * This was one continuous scroll of eleven sections, and the two acts it was
 * built around were separated by nothing but a hairline. A rider had to scroll
 * roughly three screens to reach the plan, so the half of the screen that says
 * what to do THIS week sat below the half that says what happened LAST week —
 * and the button that starts the week was the last thing on the page.
 *
 * Three pages, each exactly one screen, put the three questions side by side:
 * how did it go, what is coming, and what exactly do I ride. Nothing scrolls
 * vertically anywhere; the horizontal swipe is the only gesture.
 *
 * ── HOW "EXACTLY ONE SCREEN" IS ACTUALLY HELD ────────────────────────────
 *
 * The frame is `100dvh` with `overflow: hidden`, and each page is a flex column
 * whose ONE flexible child absorbs the slack — the day chart on page 1, the
 * evidence grid on page 2, the day list on page 3. Every other block is sized
 * for the shortest phone this app supports, so a 667-tall device gets the same
 * composition with a shorter flexible middle rather than a clipped one. There
 * is no `minHeight: 100dvh` anywhere: that is what lets a page grow past the
 * viewport, and it is the reason the old screen scrolled.
 *
 * Register is unchanged and deliberately shared with `W3RideCelebrateView`:
 * one big honest number, a status pill beside it, flat stat cards, hue-coded
 * tiles, acid used once per page. Confetti stays reserved for a real
 * achievement (`vm.celebrate`) and appears on page 1 only — a missed week is
 * matter-of-fact and forward-looking, never guilt and never fake celebration.
 *
 * Pure view: every field on `vm` is already real or already an explicit "—",
 * decided in `W3WeekReviewPage`. Panels the data can't back arrive empty/null
 * and are dropped entirely rather than filled.
 */

export type W3ReviewTone = 'strong' | 'steady' | 'quiet' | 'empty'

export interface W3ReviewStat { icon: 'rides' | 'timer' | 'route' | 'climb'; label: string; value: string; unit: string }
export interface W3ReviewDay { letter: string; num: string; pct: number; label: string; peak: boolean }
export interface W3ReviewDelta { label: string; value: string; dir: 'up' | 'down' | 'flat' }
export type W3ReviewTileKey = 'elev' | 'longest' | 'days' | 'coins'
export interface W3ReviewTile { key: W3ReviewTileKey; label: string; value: string; caption: string }
export interface W3ReviewMoment { badge: string; title: string; detail: string }
export interface W3ReviewFitness { delta: string; dir: 'up' | 'down' | 'flat'; now: string; note: string }
export interface W3ReviewEvidence { key: string; label: string; value: string; note: string }
export interface W3ReviewPlanDay { letter: string; title: string; tss: string; rest: boolean }

export interface W3WeekReviewVm {
  // ── chrome ──
  rangeLabel: string            // "10. Aug – 16. Aug"
  weekTag: string               // "KW 33"
  // ── page 1 ──
  tone: W3ReviewTone
  celebrate: boolean            // confetti — only on a genuine achievement
  kicker: string
  title: string
  titleAccent: string
  tssDone: number
  complianceLabel: string       // "204 von 240 TSS" | "kein Plan hinterlegt"
  compliancePct: number | null  // 0..999, null without a plan
  verdict: string
  stats: W3ReviewStat[]         // 4, real (or "—")
  days: W3ReviewDay[]           // 7 Mon→Sun, or empty
  deltas: W3ReviewDelta[]       // vs. the week before; empty when unknown
  tiles: W3ReviewTile[]         // 0..4
  moment: W3ReviewMoment | null
  fitness: W3ReviewFitness | null
  // ── pages 2 & 3 ──
  nextBlock: string             // "Aufbaublock · Woche 2"
  nextTitle: string
  nextAccent: string
  nextTss: number | null
  nextTssNote: string
  rampFromLabel: string         // "letzte Woche"
  rampFrom: number | null       // last week's TSS, for the two-bar compare
  preface: string | null
  evidence: W3ReviewEvidence[]
  planDays: W3ReviewPlanDay[]
  /** "DER PLAN" on Monday; "DER REST DER WOCHE" once days have already passed —
   *  `/weeks/current` is anchored on today, so it can only hand back what is
   *  still ahead, and the heading must not imply otherwise. */
  planDaysLabel: string
}

const STAT_ICON = { rides: Bike, timer: Timer, route: RouteIcon, climb: Mountain }
const DELTA_ICON = { up: TrendingUp, down: TrendingDown, flat: Minus }
/** Insight-tile hues — the same four-hue set the AVATAR UNLOCKED tiles use, so
 *  acid stays the single loud voice per page. Tokens only, never a hex. */
const TILE_META: Record<W3ReviewTileKey, { icon: typeof Mountain; hue: string }> = {
  elev: { icon: Mountain, hue: T.evening },
  longest: { icon: RouteIcon, hue: T.cool },
  days: { icon: CalendarCheck, hue: T.training },
  coins: { icon: Coins, hue: T.warn },
}
/** The levers behind the week, hue-coded so the grid reads as four kinds of
 *  reason rather than four identical boxes. Unknown keys fall back to `cool`
 *  — the generator may name a lever this screen has never seen. */
const EVIDENCE_HUE: Record<string, string> = {
  block: T.evening, ctl: T.training, ramp: T.acid, hours: T.cool, event: T.warn,
}
const CONFETTI_HUES = [T.acid, T.evening, T.cool, T.warn, T.acid, T.training]

/** Ease-out-cubic tally — the celebration screen's "Tally" motion. Under
 *  `prefers-reduced-motion` the target is returned DERIVED rather than written
 *  into state from the effect: no animation frame is ever scheduled, and the
 *  number is simply correct on the first paint. */
function useCountUp(target: number, reduce: boolean | null, ms = 900) {
  const [n, setN] = useState(0)
  useEffect(() => {
    if (reduce) return
    let raf = 0
    const t0 = performance.now()
    const tick = (now: number) => {
      const p = Math.min(1, (now - t0) / ms)
      setN(Math.round(target * (1 - Math.pow(1 - p, 3))))
      if (p < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [target, reduce, ms])
  return reduce ? target : n
}

const nf = (x: number) => x.toLocaleString('de-DE')

/** "92 TSS" → 92, "—" → 0. The plan's per-day load arrives already formatted in
 *  German; this reads the figure back out only to size a bar, never to print a
 *  number the server did not write. */
const tssOf = (s: string): number => {
  const digits = (s || '').replace(/[^\d]/g, '')
  return digits ? Number(digits) : 0
}

const PAGES = ['Letzte Woche', 'Diese Woche', 'Der Plan'] as const

export default function W3WeekReviewView({
  vm, onClose, onStart, onFullPlan,
}: { vm: W3WeekReviewVm; onClose?: () => void; onStart?: () => void; onFullPlan?: () => void }) {
  const reduce = useReducedMotion()
  const done = useCountUp(vm.tssDone, reduce)
  const scroller = useRef<HTMLDivElement | null>(null)
  const [at, setAt] = useState(0)

  // Read from scrollLeft rather than tracked per page, so the dots stay correct
  // after a fling that lands somewhere the click handler never saw.
  const onScroll = useCallback(() => {
    const el = scroller.current
    if (!el) return
    setAt(Math.round(el.scrollLeft / Math.max(1, el.clientWidth)))
  }, [])

  const goTo = (i: number) => {
    const el = scroller.current
    if (!el) return
    el.scrollTo({ left: i * el.clientWidth, behavior: reduce ? 'auto' : 'smooth' })
  }

  // The week's verdict hue. Quiet weeks are MID, never red: a missed week is a
  // fact to plan around, not a failure to colour-code.
  const toneHue = vm.tone === 'strong' ? T.acid : vm.tone === 'steady' ? T.training : T.mid
  // The compliance ring never draws past full — 130 % of plan is still one ring.
  const ringPct = vm.compliancePct != null ? Math.min(100, vm.compliancePct) : 0

  return (
    <div className="w3-root">
      {/* 100dvh and hidden, NOT minHeight — see the docblock. This one property
          is what makes "never bigger than the screen" true rather than hoped. */}
      <div className="w3-frame" style={{
        fontFamily: FONT, display: 'flex', flexDirection: 'column',
        height: '100dvh', overflow: 'hidden', background: T.bg,
      }}>
        <W3StatusBar />

        {/* The week under review + close. Once, above the pages, rather than
            repeated three times — it is the same week on all of them. */}
        <div style={{ flex: 'none', padding: '2px 20px 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
          <div style={{ minWidth: 0, display: 'flex', gap: 8, alignItems: 'center', padding: '6px 13px', borderRadius: 100, background: T.surface }}>
            <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: 1, color: T.acid, flex: 'none' }}>{vm.weekTag}</span>
            <span style={{ minWidth: 0, fontSize: 11, fontWeight: 600, letterSpacing: 0.4, color: T.mid, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{vm.rangeLabel}</span>
          </div>
          <button onClick={onClose} aria-label="Schließen" style={{ width: 38, height: 38, flex: 'none', borderRadius: 100, background: 'transparent', border: 0, display: 'grid', placeItems: 'center', cursor: 'pointer' }}>
            <X size={19} color={T.mid} />
          </button>
        </div>

        <div
          ref={scroller}
          onScroll={onScroll}
          style={{
            flex: 1, minHeight: 0, display: 'flex',
            overflowX: 'auto', overflowY: 'hidden',
            scrollSnapType: 'x mandatory',
            // Only the horizontal swipe belongs to this screen; there is
            // nothing to scroll vertically and a stray vertical drag must not
            // rubber-band the page.
            touchAction: 'pan-x',
            scrollbarWidth: 'none', overscrollBehavior: 'contain',
          }}>

          {/* ── 1 · LETZTE WOCHE ─────────────────────────────────────────── */}
          <Page label={PAGES[0]}>
            <div style={{ position: 'relative', flex: 'none', display: 'flex', flexDirection: 'column', gap: 6, paddingTop: 10 }}>
              <div aria-hidden style={{ position: 'absolute', inset: '-14px -20px 0', background: `radial-gradient(120% 80% at 76% 24%, ${toneHue}22, ${toneHue}00 62%)` }} />
              {vm.celebrate && CONFETTI_HUES.map((c, i) => (
                <motion.div key={i} aria-hidden
                  initial={reduce ? false : { y: -18, opacity: 0 }}
                  animate={reduce ? {} : { y: [-18, 210], opacity: [0, 1, 0], rotate: [0, 200] }}
                  transition={{ duration: 2.6, delay: i * 0.15, repeat: Infinity, repeatDelay: 1.2 }}
                  style={{ position: 'absolute', top: 0, left: `${10 + i * 15}%`, width: 5, height: 11, borderRadius: 2, background: c }} />
              ))}
              <span style={{ position: 'relative', fontSize: 10.5, fontWeight: 800, letterSpacing: 1.6, color: toneHue }}>{vm.kicker}</span>
              <span style={{ position: 'relative', fontSize: 30, fontWeight: 700, letterSpacing: -1.2, color: T.ink, lineHeight: 1.04 }}>
                {vm.title} <span style={{ color: toneHue }}>{vm.titleAccent}</span>
              </span>

              <div style={{ position: 'relative', display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12, marginTop: 6 }}>
                <div style={{ minWidth: 0, display: 'flex', alignItems: 'baseline', gap: 7 }}>
                  <span style={{ fontSize: 56, fontWeight: 800, letterSpacing: -2.6, color: T.ink, lineHeight: 0.88, fontVariantNumeric: 'tabular-nums' }}>{nf(done)}</span>
                  <span style={{ fontSize: 14, fontWeight: 700, color: T.quiet }}>TSS</span>
                </div>
                <div style={{ flex: 'none', position: 'relative', width: 56, height: 56, display: 'grid', placeItems: 'center' }}>
                  <svg width="56" height="56" viewBox="0 0 62 62" style={{ position: 'absolute', transform: 'rotate(-90deg)' }}>
                    <circle cx="31" cy="31" r="27" fill="none" stroke={T.surface2} strokeWidth="6" />
                    {vm.compliancePct != null && (
                      <motion.circle cx="31" cy="31" r="27" fill="none" stroke={toneHue} strokeWidth="6" strokeLinecap="round"
                        strokeDasharray={2 * Math.PI * 27}
                        initial={reduce ? false : { strokeDashoffset: 2 * Math.PI * 27 }}
                        animate={{ strokeDashoffset: 2 * Math.PI * 27 * (1 - ringPct / 100) }}
                        transition={{ duration: 0.9, ease: EASE, delay: 0.15 }} />
                    )}
                  </svg>
                  <span style={{ position: 'relative', fontSize: 13, fontWeight: 800, letterSpacing: -0.4, color: vm.compliancePct != null ? T.ink : T.quiet }}>
                    {vm.compliancePct != null ? `${vm.compliancePct}%` : DASH}
                  </span>
                </div>
              </div>

              <span style={{ position: 'relative', fontSize: 10, fontWeight: 700, letterSpacing: 0.6, color: T.quiet }}>{vm.complianceLabel}</span>
              <span style={{ position: 'relative', fontSize: 12.5, fontWeight: 500, lineHeight: 1.4, color: T.mid, marginTop: 1 }}>{vm.verdict}</span>
            </div>

            {/* the week in four real figures */}
            <div style={{ flex: 'none', display: 'flex', gap: 7, marginTop: 14 }}>
              {vm.stats.map((s) => {
                const Ic = STAT_ICON[s.icon]
                return (
                  <div key={s.label} style={{ flex: 1, minWidth: 0, padding: '10px 9px 12px', borderRadius: 16, background: T.surface, display: 'flex', flexDirection: 'column', gap: 5 }}>
                    <Ic size={13} color={T.acid} />
                    <span style={{ fontSize: 7.5, fontWeight: 700, letterSpacing: 0.8, color: T.quiet, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.label}</span>
                    <span style={{ fontSize: 16, fontWeight: 800, letterSpacing: -0.5, color: s.value === DASH ? T.quiet : T.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {s.value}{s.unit && <span style={{ fontSize: 9, fontWeight: 600, color: T.quiet }}> {s.unit}</span>}
                    </span>
                  </div>
                )
              })}
            </div>

            {/* THE FLEXIBLE MIDDLE. The chart takes whatever height the device
                has left, which is what lets a 667 phone show the same page as
                an 844 one instead of a cropped version of it. */}
            {vm.days.length > 0 && (
              <div style={{ flex: 1, minHeight: 104, marginTop: 12, display: 'flex', flexDirection: 'column', gap: 9, padding: '14px 15px 12px', borderRadius: 20, background: T.surface }}>
                <div style={{ flex: 'none', display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10 }}>
                  <span style={{ minWidth: 0, fontSize: 14.5, fontWeight: 700, color: T.ink }}>So lag die Woche</span>
                  <span style={{ flex: 'none', fontSize: 9, fontWeight: 700, letterSpacing: 0.8, color: T.quiet }}>TSS / TAG</span>
                </div>
                <div style={{ flex: 1, minHeight: 40, display: 'flex', gap: 5, alignItems: 'flex-end' }}>
                  {vm.days.map((d, i) => (
                    <div key={i} style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3, alignItems: 'center', justifyContent: 'flex-end', height: '100%' }}>
                      {d.peak && <span style={{ flex: 'none', fontSize: 8.5, fontWeight: 800, color: T.acid }}>{d.label}</span>}
                      <motion.div
                        initial={reduce ? false : { scaleY: 0 }} animate={{ scaleY: 1 }}
                        transition={{ duration: 0.5, ease: EASE, delay: 0.1 + i * 0.05 }}
                        style={{
                          width: '100%', height: `${Math.max(4, d.pct)}%`, minHeight: 4, transformOrigin: 'bottom',
                          borderRadius: 5, background: d.peak ? T.acid : d.pct > 0 ? T.acidDeep : T.surface2,
                          opacity: d.peak ? 1 : d.pct > 0 ? 0.55 : 1,
                        }} />
                    </div>
                  ))}
                </div>
                <div style={{ flex: 'none', display: 'flex', gap: 5 }}>
                  {vm.days.map((d, i) => (
                    <div key={i} style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 1, alignItems: 'center' }}>
                      <span style={{ fontSize: 9, fontWeight: 700, color: d.peak ? T.acid : T.quiet }}>{d.letter}</span>
                      <span style={{ fontSize: 8, fontWeight: 600, color: T.quiet }}>{d.num}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* WHAT THE WEEK MOVED, in one strip of three. The old screen gave
                fitness, the deltas, four insight tiles and the best moment a
                full-width block each — five ways of saying "and here is another
                number", and the reason the plan was three screens down.

                THREE OF THE FOUR INSIGHT TILES WERE RESTATEMENTS: `elev` prints
                the same metres as the HÖHENMETER stat card above, `days` the
                same count the chart draws, `longest` a distance the DISTANZ
                card already frames. Only `coins` carried something no other
                block on this page says, so it is the one that survived the cut
                to three. */}
            {(() => {
              const coins = vm.tiles.find((t) => t.key === 'coins') ?? null
              const chips: React.ReactNode[] = []
              if (vm.fitness) {
                const f = vm.fitness
                chips.push(
                  <Chip key="ctl" label="FITNESS · CTL">
                    <span style={{ fontSize: 19, fontWeight: 800, letterSpacing: -0.7, color: f.dir === 'up' ? T.training : f.delta === DASH ? T.quiet : T.mid }}>{f.delta}</span>
                    <span style={{ minWidth: 0, fontSize: 10.5, fontWeight: 600, color: T.quiet, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.now}</span>
                  </Chip>,
                )
              }
              if (coins) {
                chips.push(
                  <Chip key="coins" label={coins.label}>
                    <Coins size={13} color={TILE_META.coins.hue} style={{ flex: 'none' }} />
                    <span style={{ minWidth: 0, fontSize: 16, fontWeight: 800, letterSpacing: -0.4, color: coins.value === DASH ? T.quiet : TILE_META.coins.hue, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{coins.value}</span>
                  </Chip>,
                )
              }
              for (const d of vm.deltas) {
                if (chips.length >= 3) break
                const Ic = DELTA_ICON[d.dir]
                const hue = d.dir === 'up' ? T.training : d.dir === 'down' ? T.mid : T.quiet
                chips.push(
                  <Chip key={d.label} label={`${d.label} · VORWOCHE`}>
                    <Ic size={13} color={hue} style={{ flex: 'none' }} />
                    <span style={{ minWidth: 0, fontSize: 15, fontWeight: 800, letterSpacing: -0.4, color: hue, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.value}</span>
                  </Chip>,
                )
              }
              if (chips.length === 0) return null
              return <div style={{ flex: 'none', display: 'flex', gap: 7, marginTop: 10 }}>{chips.slice(0, 3)}</div>
            })()}

            {/* The one thing worth naming out of the week, as a line rather
                than a card — a breakthrough deserves the words, not a panel. */}
            {vm.moment && (
              <div style={{ flex: 'none', display: 'flex', gap: 9, alignItems: 'center', marginTop: 8, padding: '10px 13px', borderRadius: 16, background: `linear-gradient(160deg, ${T.acid}12, ${T.surface})`, border: `1px solid ${T.acid}2E` }}>
                <div style={{ flex: 'none', width: 26, height: 26, borderRadius: 9, background: T.acidDim, display: 'grid', placeItems: 'center' }}><Trophy size={14} color={T.acid} /></div>
                <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 1 }}>
                  <span style={{ fontSize: 8, fontWeight: 800, letterSpacing: 1, color: T.acid, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{vm.moment.badge}</span>
                  <span style={{ minWidth: 0, fontSize: 13, fontWeight: 700, letterSpacing: -0.3, color: T.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{vm.moment.title}</span>
                </div>
              </div>
            )}
          </Page>

          {/* ── 2 · DIESE WOCHE ──────────────────────────────────────────── */}
          <Page label={PAGES[1]}>
            <div style={{ position: 'relative', flex: 'none', display: 'flex', flexDirection: 'column', gap: 6, paddingTop: 10 }}>
              <div aria-hidden style={{ position: 'absolute', inset: '-14px -20px 0', background: `radial-gradient(110% 80% at 22% 20%, ${T.acid}1A, ${T.acid}00 62%)` }} />
              <span style={{ position: 'relative', fontSize: 10.5, fontWeight: 800, letterSpacing: 1.6, color: T.acid }}>DIESE WOCHE</span>
              <span style={{ position: 'relative', fontSize: 27, fontWeight: 700, letterSpacing: -1.05, color: T.ink, lineHeight: 1.05 }}>
                {vm.nextTitle} <span style={{ color: T.acid }}>{vm.nextAccent}</span>
              </span>
              <div style={{ position: 'relative', display: 'inline-flex', alignSelf: 'flex-start', alignItems: 'center', gap: 7, padding: '6px 12px', borderRadius: 100, background: T.surface }}>
                <Layers size={12} color={T.mid} />
                <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: 0.4, color: T.mid }}>{vm.nextBlock}</span>
              </div>
            </div>

            {/* THE TARGET, AND THE RAMP IT SITS ON, as one object. The figure
                alone says nothing a rider can act on; against last week it is
                the whole story of the coming seven days. */}
            <div style={{ flex: 'none', marginTop: 14, padding: '15px 16px 16px', borderRadius: 22, background: T.surface, display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12 }}>
                <div style={{ minWidth: 0, display: 'flex', alignItems: 'baseline', gap: 7 }}>
                  <span style={{ fontSize: 46, fontWeight: 800, letterSpacing: -2.2, lineHeight: 0.9, color: vm.nextTss != null ? T.acid : T.quiet, fontVariantNumeric: 'tabular-nums' }}>
                    {vm.nextTss != null ? nf(vm.nextTss) : DASH}
                  </span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: T.quiet }}>TSS</span>
                </div>
                <Target size={18} color={T.acid} style={{ flex: 'none', marginBottom: 6 }} />
              </div>
              <span style={{ fontSize: 10.5, fontWeight: 600, color: T.quiet, marginTop: -6 }}>{vm.nextTssNote}</span>

              {vm.nextTss != null && vm.rampFrom != null && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                  {[
                    { label: vm.rampFromLabel, val: vm.rampFrom, hue: T.d2, ink: T.mid },
                    { label: 'diese Woche', val: vm.nextTss, hue: T.acid, ink: T.acid },
                  ].map((row) => {
                    const max = Math.max(vm.rampFrom ?? 0, vm.nextTss ?? 0, 1)
                    return (
                      <div key={row.label} style={{ display: 'flex', gap: 9, alignItems: 'center' }}>
                        <span style={{ flex: 'none', width: 106, fontSize: 9, fontWeight: 700, letterSpacing: 0.4, color: T.quiet, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.label}</span>
                        <div style={{ flex: 1, minWidth: 0, height: 9, borderRadius: 100, background: T.bg, overflow: 'hidden' }}>
                          <motion.div initial={reduce ? false : { width: 0 }} animate={{ width: `${Math.round((row.val / max) * 100)}%` }} transition={{ duration: 0.7, ease: EASE, delay: 0.2 }}
                            style={{ height: '100%', borderRadius: 100, background: row.hue }} />
                        </div>
                        <span style={{ flex: 'none', width: 36, textAlign: 'right', fontSize: 10.5, fontWeight: 800, color: row.ink, fontVariantNumeric: 'tabular-nums' }}>{nf(row.val)}</span>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {/* WHY THIS WEEK LOOKS LIKE THIS — a grid of levers, not a column
                of prose. The ramp is left out of it on purpose: it is drawn
                above as two bars, and printing it again here would be the same
                fact at two weights. */}
            {(() => {
              const levers = vm.evidence.filter((e) => e.key !== 'ramp')
              const shown = levers.slice(0, 4)
              const rest = levers.length - shown.length
              if (shown.length === 0) return <div style={{ flex: 1 }} />
              return (
                <div style={{ flex: 1, minHeight: 0, marginTop: 12, display: 'flex', flexDirection: 'column', gap: 7 }}>
                  <div style={{ flex: 'none', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Gauge size={14} color={T.acid} />
                    <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1, color: T.quiet }}>WARUM GENAU SO</span>
                    {/* NO SILENT CAP. A lever that does not fit is counted. */}
                    {rest > 0 && (
                      <span style={{ marginLeft: 'auto', fontSize: 9.5, fontWeight: 700, color: T.quiet }}>+{rest} weitere</span>
                    )}
                  </div>
                  <div style={{ flex: 'none', display: 'grid', gridTemplateColumns: '1fr 1fr', gridAutoRows: 'min-content', gap: 7 }}>
                    {shown.map((e) => {
                      const hue = EVIDENCE_HUE[e.key] ?? T.cool
                      return (
                        <div key={e.key} style={{
                          minWidth: 0, minHeight: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column', gap: 3,
                          padding: '10px 12px', borderRadius: 16,
                          background: `linear-gradient(180deg, ${hue}14, ${T.surface})`, border: `1px solid ${hue}2E`,
                        }}>
                          <span style={{ fontSize: 7.5, fontWeight: 700, letterSpacing: 0.7, color: T.quiet, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.label}</span>
                          <span style={{ fontSize: 15, fontWeight: 800, letterSpacing: -0.4, color: e.value === DASH ? T.quiet : T.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.value}</span>
                          <span style={{ minWidth: 0, fontSize: 9.5, fontWeight: 500, lineHeight: 1.35, color: hue, overflow: 'hidden' }}>{e.note}</span>
                        </div>
                      )
                    })}
                  </div>
                  {vm.preface && (
                    <span style={{ flex: 'none', marginTop: 3, fontSize: 11.5, fontWeight: 500, lineHeight: 1.45, color: T.mid }}>{vm.preface}</span>
                  )}
                  {/* The slack lands here, under the last sentence, rather than
                      as a hole between the grid and it. */}
                  <div style={{ flex: 1, minHeight: 0 }} />
                </div>
              )
            })()}
          </Page>

          {/* ── 3 · DER PLAN ─────────────────────────────────────────────── */}
          <Page label={PAGES[2]}>
            <div style={{ flex: 'none', display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12, paddingTop: 12 }}>
              <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: 1.6, color: T.acid }}>{vm.planDaysLabel}</span>
                <span style={{ fontSize: 25, fontWeight: 700, letterSpacing: -1, color: T.ink, lineHeight: 1.05 }}>Deine sieben Tage</span>
              </div>
              {vm.nextTss != null && (
                <div style={{ flex: 'none', display: 'flex', alignItems: 'baseline', gap: 5 }}>
                  <span style={{ fontSize: 24, fontWeight: 800, letterSpacing: -1, color: T.acid, fontVariantNumeric: 'tabular-nums' }}>{nf(vm.nextTss)}</span>
                  <span style={{ fontSize: 10.5, fontWeight: 700, color: T.quiet }}>TSS</span>
                </div>
              )}
            </div>

            {/* THE SEVEN DAYS, WITH THEIR WEIGHT DRAWN. The list used to print
                the load as text only, so a 138-TSS Saturday and a 38-TSS Sunday
                looked alike until you read them. The bar is scaled to the
                week's biggest day; a rest day has none rather than an empty
                track pretending to be a measurement. */}
            {vm.planDays.length > 0 && (() => {
              const max = Math.max(1, ...vm.planDays.map((d) => tssOf(d.tss)))
              return (
                <div style={{ flex: 1, minHeight: 0, marginTop: 14, display: 'flex', flexDirection: 'column', gap: 5 }}>
                  {vm.planDays.map((d, i) => {
                    const load = tssOf(d.tss)
                    return (
                      <div key={i} style={{
                        flex: 1, minHeight: 34, maxHeight: 62, display: 'flex', alignItems: 'center', gap: 10,
                        padding: '0 13px', borderRadius: 14,
                        background: d.rest ? 'transparent' : T.surface,
                        boxShadow: d.rest ? `inset 0 0 0 1px ${T.rule}` : 'none',
                      }}>
                        <span style={{ flex: 'none', width: 20, fontSize: 10.5, fontWeight: 800, letterSpacing: 0.4, color: d.rest ? T.quiet : T.acid }}>{d.letter}</span>
                        <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, fontWeight: d.rest ? 500 : 700, color: d.rest ? T.quiet : T.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.title}</span>
                        {load > 0 && (
                          <div style={{ flex: 'none', width: 54, height: 6, borderRadius: 100, background: T.bg, overflow: 'hidden' }}>
                            <motion.div
                              initial={reduce ? false : { width: 0 }} animate={{ width: `${Math.round((load / max) * 100)}%` }}
                              transition={{ duration: 0.5, ease: EASE, delay: 0.1 + i * 0.04 }}
                              style={{ height: '100%', borderRadius: 100, background: T.acidDeep }} />
                          </div>
                        )}
                        <span style={{ flex: 'none', width: 52, textAlign: 'right', fontSize: 10.5, fontWeight: 700, color: d.rest ? T.quiet : T.mid, fontVariantNumeric: 'tabular-nums' }}>{d.tss}</span>
                      </div>
                    )
                  })}
                </div>
              )
            })()}

            <div style={{ flex: 'none', display: 'flex', flexDirection: 'column', gap: 7, marginTop: 12 }}>
              <button onClick={onStart}
                style={{ height: 52, borderRadius: 100, border: 0, background: T.acid, color: T.bg, fontFamily: FONT, fontSize: 15.5, fontWeight: 700, letterSpacing: -0.2, cursor: 'pointer', display: 'flex', gap: 9, justifyContent: 'center', alignItems: 'center' }}>
                Woche starten<ArrowRight size={18} color={T.bg} />
              </button>
              <button onClick={onFullPlan}
                style={{ height: 38, borderRadius: 100, background: 'transparent', border: 0, fontFamily: FONT, fontSize: 12, fontWeight: 700, letterSpacing: 0.4, color: T.mid, cursor: 'pointer', display: 'flex', gap: 7, justifyContent: 'center', alignItems: 'center' }}>
                GANZEN TRAININGSPLAN ANSEHEN<CalendarDays size={13} color={T.mid} />
              </button>
            </div>
          </Page>
        </div>

        {/* Where you are, and a way to jump. Tappable because a swipe is not
            discoverable on a screen that has never scrolled sideways before. */}
        <div role="tablist" aria-label="Wochenrückblick" style={{ flex: 'none', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 7, height: 34 }}>
          {PAGES.map((label, i) => (
            <button key={label} role="tab" aria-selected={i === at} aria-label={label}
              onClick={() => goTo(i)}
              style={{ border: 0, background: 'transparent', padding: 6, cursor: 'pointer', display: 'grid', placeItems: 'center' }}>
              <span style={{
                display: 'block', width: i === at ? 18 : 6, height: 6, borderRadius: 100,
                background: i === at ? T.acid : T.d2, transition: 'width .18s ease, background .18s ease',
              }} />
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

/** One figure in the "what the week moved" strip. Three at most, equal width,
 *  so the row reads as a set rather than as three cards that happened to line
 *  up. */
function Chip({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3, padding: '10px 12px', borderRadius: 16, background: T.surface }}>
      <span style={{ fontSize: 7.5, fontWeight: 700, letterSpacing: 0.8, color: T.quiet, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, minWidth: 0 }}>{children}</div>
    </div>
  )
}

/** One screen. Sized by the scroller, never by its own contents — the whole
 *  guarantee of this screen rests on `height: 100%` plus `overflow: hidden`
 *  here, and on every child either being `flex: none` or the single flexible
 *  one that absorbs what is left. */
function Page({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <section
      aria-label={label}
      style={{
        flex: '0 0 100%', width: '100%', height: '100%',
        scrollSnapAlign: 'start', overflow: 'hidden',
        display: 'flex', flexDirection: 'column',
        padding: '0 20px 4px', minWidth: 0,
      }}>
      {children}
    </section>
  )
}
