import { useEffect, useState } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import {
  X, Bike, Timer, Route as RouteIcon, Mountain, Flame, Gauge, CalendarCheck,
  TrendingUp, TrendingDown, Minus, Trophy, ArrowRight, Activity, Coins,
} from 'lucide-react'
import { T, FONT, EASE, DASH, band } from './w3tokens'
import './w3.css'
import W3StatusBar from './W3StatusBar'

/**
 * W3 · WOCHENRÜCKBLICK — the start-of-week moment. One scroll, two acts:
 *
 *   ACT 1 · LETZTE WOCHE — what actually happened, celebrated honestly. The
 *     week's real TSS as the big number, the plan it was measured against, the
 *     shape of the seven days, the deltas against the week before, and the
 *     insight tiles that make a raw figure human (the "≈ 6,9× Mount Everest"
 *     register the AVATAR UNLOCKED reveal established).
 *   ACT 2 · DIESE WOCHE — the block the coming week sits in, its TSS target,
 *     and the EVIDENCE behind it: the CTL anchor, the ramp against last week,
 *     the declared-hours note the generator itself wrote, the event horizon.
 *
 * Register, deliberately shared with `W3RideCelebrateView` and the AVATAR
 * UNLOCKED reveal so this is not a third visual language: one big honest
 * number, a status pill beside it, four flat stat cards, hue-coded insight
 * tiles, and acid used once per screenful. Confetti is reserved for a real
 * achievement (`vm.celebrate`) — a missed week is matter-of-fact and
 * forward-looking, never guilt and never fake celebration.
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
  // ── act 1 ──
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
  // ── act 2 ──
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
 *  acid stays the single loud voice per screenful. Tokens only, never a hex. */
const TILE_META: Record<W3ReviewTileKey, { icon: typeof Mountain; hue: string }> = {
  elev: { icon: Mountain, hue: T.evening },
  longest: { icon: RouteIcon, hue: T.cool },
  days: { icon: CalendarCheck, hue: T.training },
  coins: { icon: Coins, hue: T.warn },
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

export default function W3WeekReviewView({
  vm, onClose, onStart, onFullPlan,
}: { vm: W3WeekReviewVm; onClose?: () => void; onStart?: () => void; onFullPlan?: () => void }) {
  const reduce = useReducedMotion()
  const done = useCountUp(vm.tssDone, reduce)

  // The week's verdict hue. Quiet weeks are MID, never red: a missed week is a
  // fact to plan around, not a failure to colour-code.
  const toneHue = vm.tone === 'strong' ? T.acid : vm.tone === 'steady' ? T.training : T.mid
  // The compliance ring never draws past full — 130 % of plan is still one ring.
  const ringPct = vm.compliancePct != null ? Math.min(100, vm.compliancePct) : 0

  return (
    <div className="w3-root">
      <div className="w3-frame" style={{ fontFamily: FONT, display: 'flex', flexDirection: 'column', minHeight: '100dvh', background: T.bg }}>
        <W3StatusBar />

        {/* Top row: the week under review + close */}
        <div style={{ padding: '4px 20px 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
          <div style={{ minWidth: 0, display: 'flex', gap: 8, alignItems: 'center', padding: '7px 14px', borderRadius: 100, background: T.surface }}>
            <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: 1, color: T.acid, flex: 'none' }}>{vm.weekTag}</span>
            <span style={{ minWidth: 0, fontSize: 11, fontWeight: 600, letterSpacing: 0.4, color: T.mid, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{vm.rangeLabel}</span>
          </div>
          <button onClick={onClose} aria-label="Schließen" style={{ width: 40, height: 40, flex: 'none', borderRadius: 100, background: 'transparent', border: 0, display: 'grid', placeItems: 'center', cursor: 'pointer' }}>
            <X size={19} color={T.mid} />
          </button>
        </div>

        {/* ── ACT 1 · hero ─────────────────────────────────────────────── */}
        <div style={{ position: 'relative', padding: '18px 20px 22px', overflow: 'hidden' }}>
          <div style={{ position: 'absolute', inset: 0, background: `radial-gradient(120% 80% at 76% 24%, ${toneHue}22, ${toneHue}00 62%)` }} />
          {vm.celebrate && CONFETTI_HUES.map((c, i) => (
            <motion.div key={i}
              initial={reduce ? false : { y: -18, opacity: 0 }}
              animate={reduce ? {} : { y: [-18, 210], opacity: [0, 1, 0], rotate: [0, 200] }}
              transition={{ duration: 2.6, delay: i * 0.15, repeat: Infinity, repeatDelay: 1.2 }}
              style={{ position: 'absolute', top: 0, left: `${10 + i * 15}%`, width: 5, height: 11, borderRadius: 2, background: c }} />
          ))}

          <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', gap: 7 }}>
            <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: 1.6, color: toneHue }}>{vm.kicker}</span>
            <span style={{ fontSize: 36, fontWeight: 700, letterSpacing: -1.4, color: T.ink, lineHeight: 1.02 }}>
              {vm.title} <span style={{ color: toneHue }}>{vm.titleAccent}</span>
            </span>

            <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12, marginTop: 8 }}>
              <div style={{ minWidth: 0, display: 'flex', alignItems: 'baseline', gap: 8 }}>
                <span style={{ fontSize: 66, fontWeight: 800, letterSpacing: -3, color: T.ink, lineHeight: 0.88, fontVariantNumeric: 'tabular-nums' }}>{nf(done)}</span>
                <span style={{ fontSize: 15, fontWeight: 700, color: T.quiet }}>TSS</span>
              </div>
              {/* Compliance ring — plan-vs-done, or an honest "no plan" dial */}
              <div style={{ flex: 'none', position: 'relative', width: 62, height: 62, display: 'grid', placeItems: 'center' }}>
                <svg width="62" height="62" viewBox="0 0 62 62" style={{ position: 'absolute', transform: 'rotate(-90deg)' }}>
                  <circle cx="31" cy="31" r="27" fill="none" stroke={T.surface2} strokeWidth="6" />
                  {vm.compliancePct != null && (
                    <motion.circle cx="31" cy="31" r="27" fill="none" stroke={toneHue} strokeWidth="6" strokeLinecap="round"
                      strokeDasharray={2 * Math.PI * 27}
                      initial={reduce ? false : { strokeDashoffset: 2 * Math.PI * 27 }}
                      animate={{ strokeDashoffset: 2 * Math.PI * 27 * (1 - ringPct / 100) }}
                      transition={{ duration: 0.9, ease: EASE, delay: 0.15 }} />
                  )}
                </svg>
                <span style={{ position: 'relative', fontSize: 14, fontWeight: 800, letterSpacing: -0.4, color: vm.compliancePct != null ? T.ink : T.quiet }}>
                  {vm.compliancePct != null ? `${vm.compliancePct}%` : DASH}
                </span>
              </div>
            </div>

            <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.6, color: T.quiet }}>{vm.complianceLabel}</span>
            <span style={{ fontSize: 13.5, fontWeight: 500, lineHeight: 1.45, color: T.mid, marginTop: 2 }}>{vm.verdict}</span>
          </div>
        </div>

        {/* Stat cards — the week in four real figures */}
        <div style={{ ...band(20), flexDirection: 'row', gap: 8 }}>
          {vm.stats.map((s) => {
            const Ic = STAT_ICON[s.icon]
            return (
              <div key={s.label} style={{ flex: 1, minWidth: 0, padding: '13px 10px 15px', borderRadius: 18, background: T.surface, display: 'flex', flexDirection: 'column', gap: 7 }}>
                <Ic size={15} color={T.acid} />
                <span style={{ fontSize: 8, fontWeight: 700, letterSpacing: 0.9, color: T.quiet, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.label}</span>
                <span style={{ fontSize: 18, fontWeight: 800, letterSpacing: -0.6, color: s.value === DASH ? T.quiet : T.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {s.value}{s.unit && <span style={{ fontSize: 9.5, fontWeight: 600, color: T.quiet }}> {s.unit}</span>}
                </span>
              </div>
            )
          })}
        </div>

        {/* The shape of the week — seven real days */}
        {vm.days.length > 0 && (
          <div style={band(20)}>
            <div style={{ ...cardBox(), gap: 13 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10 }}>
                <span style={{ minWidth: 0, fontSize: 17, fontWeight: 700, color: T.ink }}>So lag die Woche</span>
                <span style={{ flex: 'none', fontSize: 10, fontWeight: 700, letterSpacing: 0.8, color: T.quiet }}>TSS / TAG</span>
              </div>
              <div style={{ display: 'flex', gap: 5, alignItems: 'flex-end', height: 86 }}>
                {vm.days.map((d, i) => (
                  <div key={i} style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'center', justifyContent: 'flex-end', height: '100%' }}>
                    {d.peak && <span style={{ fontSize: 8.5, fontWeight: 800, letterSpacing: 0.3, color: T.acid }}>{d.label}</span>}
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
              <div style={{ display: 'flex', gap: 5 }}>
                {vm.days.map((d, i) => (
                  <div key={i} style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2, alignItems: 'center' }}>
                    <span style={{ fontSize: 9.5, fontWeight: 700, color: d.peak ? T.acid : T.quiet }}>{d.letter}</span>
                    <span style={{ fontSize: 8.5, fontWeight: 600, color: T.quiet }}>{d.num}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* vs. the week before — real deltas, no verdict attached */}
        {vm.deltas.length > 0 && (
          <div style={{ ...band(20), gap: 9 }}>
            <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1, color: T.quiet }}>GEGENÜBER DER VORWOCHE</span>
            <div style={{ display: 'flex', gap: 8 }}>
              {vm.deltas.map((d) => {
                const Ic = DELTA_ICON[d.dir]
                const hue = d.dir === 'up' ? T.training : d.dir === 'down' ? T.mid : T.quiet
                return (
                  <div key={d.label} style={{ flex: 1, minWidth: 0, padding: '10px 11px', borderRadius: 14, background: T.surface, display: 'flex', flexDirection: 'column', gap: 5 }}>
                    <span style={{ fontSize: 8.5, fontWeight: 700, letterSpacing: 0.7, color: T.quiet, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.label}</span>
                    <div style={{ display: 'flex', gap: 5, alignItems: 'center', minWidth: 0 }}>
                      <Ic size={13} color={hue} style={{ flex: 'none' }} />
                      <span style={{ minWidth: 0, fontSize: 14.5, fontWeight: 800, letterSpacing: -0.4, color: hue, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.value}</span>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Insight tiles — the raw figure made human */}
        {vm.tiles.length > 0 && (
          <div style={{ ...band(20), display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {vm.tiles.map((t) => {
              const meta = TILE_META[t.key]; const Ic = meta.icon
              return (
                <div key={t.key} style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4, padding: '11px 12px', borderRadius: 16, background: `linear-gradient(180deg, ${meta.hue}14, ${T.surface})`, border: `1px solid ${meta.hue}2E` }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6 }}>
                    <div style={{ flex: 'none', width: 26, height: 26, borderRadius: 8, background: `${meta.hue}22`, display: 'grid', placeItems: 'center' }}><Ic size={14} color={meta.hue} /></div>
                    <span style={{ minWidth: 0, fontSize: 8, fontWeight: 700, letterSpacing: 0.6, color: T.quiet, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.label}</span>
                  </div>
                  <span style={{ fontSize: 19, fontWeight: 700, letterSpacing: -0.5, color: t.value === DASH ? T.quiet : T.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.value}</span>
                  <span style={{ fontSize: 10, fontWeight: 600, lineHeight: 1.25, color: meta.hue }}>{t.caption}</span>
                </div>
              )
            })}
          </div>
        )}

        {/* Best moment — a real breakthrough, else the week's biggest ride */}
        {vm.moment && (
          <div style={band(20)}>
            <div style={{ ...cardBox(), gap: 10, background: `linear-gradient(160deg, ${T.acid}12, ${T.surface})`, border: `1px solid ${T.acid}2E` }}>
              <div style={{ display: 'flex', gap: 9, alignItems: 'center' }}>
                <div style={{ flex: 'none', width: 28, height: 28, borderRadius: 9, background: T.acidDim, display: 'grid', placeItems: 'center' }}><Trophy size={15} color={T.acid} /></div>
                <span style={{ minWidth: 0, fontSize: 9.5, fontWeight: 800, letterSpacing: 1, color: T.acid, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{vm.moment.badge}</span>
              </div>
              <span style={{ fontSize: 20, fontWeight: 700, letterSpacing: -0.7, lineHeight: 1.15, color: T.ink }}>{vm.moment.title}</span>
              <span style={{ fontSize: 12.5, fontWeight: 500, lineHeight: 1.45, color: T.mid }}>{vm.moment.detail}</span>
            </div>
          </div>
        )}

        {/* Fitness moved — the honest CTL delta across the week */}
        {vm.fitness && (
          <div style={band(26)}>
            <div style={{ ...cardBox(), gap: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
                <span style={{ minWidth: 0, fontSize: 17, fontWeight: 700, color: T.ink }}>Deine Fitness</span>
                <span style={{ flex: 'none', fontSize: 10, fontWeight: 700, letterSpacing: 0.8, color: T.quiet }}>CTL · MO → SO</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 14 }}>
                <span style={{ fontSize: 40, fontWeight: 800, letterSpacing: -1.6, lineHeight: 1, color: vm.fitness.dir === 'up' ? T.training : vm.fitness.delta === DASH ? T.quiet : T.mid }}>
                  {vm.fitness.delta}
                </span>
                <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2, paddingBottom: 4 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: T.ink }}>{vm.fitness.now}</span>
                  <span style={{ fontSize: 10.5, fontWeight: 600, color: T.quiet }}>jetzt</span>
                </div>
              </div>
              <span style={{ fontSize: 12.5, fontWeight: 500, lineHeight: 1.45, color: T.mid }}>{vm.fitness.note}</span>
            </div>
          </div>
        )}

        {/* ── ACT 2 · the coming week ───────────────────────────────────── */}
        <div style={{ ...band(0), paddingBottom: 0 }}>
          <div style={{ height: 1, background: T.rule }} />
        </div>

        <div style={{ position: 'relative', padding: '22px 20px 20px', overflow: 'hidden' }}>
          <div style={{ position: 'absolute', inset: 0, background: `radial-gradient(110% 80% at 22% 20%, ${T.acid}1A, ${T.acid}00 62%)` }} />
          <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', gap: 7 }}>
            <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: 1.6, color: T.acid }}>DIESE WOCHE</span>
            <span style={{ fontSize: 30, fontWeight: 700, letterSpacing: -1.1, color: T.ink, lineHeight: 1.05 }}>
              {vm.nextTitle} <span style={{ color: T.acid }}>{vm.nextAccent}</span>
            </span>
            <span style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: 0.6, color: T.mid }}>{vm.nextBlock}</span>

            {/* Target vs. last week — the ramp, drawn */}
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10, marginTop: 10 }}>
              <span style={{ fontSize: 52, fontWeight: 800, letterSpacing: -2.4, lineHeight: 0.9, color: vm.nextTss != null ? T.acid : T.quiet, fontVariantNumeric: 'tabular-nums' }}>
                {vm.nextTss != null ? nf(vm.nextTss) : DASH}
              </span>
              <span style={{ fontSize: 14, fontWeight: 700, color: T.quiet, paddingBottom: 6 }}>TSS</span>
            </div>
            <span style={{ fontSize: 11.5, fontWeight: 600, color: T.quiet }}>{vm.nextTssNote}</span>

            {vm.nextTss != null && vm.rampFrom != null && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 7, marginTop: 10 }}>
                {[
                  { label: vm.rampFromLabel, val: vm.rampFrom, hue: T.surface2, ink: T.mid },
                  { label: 'diese Woche', val: vm.nextTss, hue: T.acid, ink: T.acid },
                ].map((row) => {
                  const max = Math.max(vm.rampFrom ?? 0, vm.nextTss ?? 0, 1)
                  return (
                    <div key={row.label} style={{ display: 'flex', gap: 9, alignItems: 'center' }}>
                      <span style={{ flex: 'none', width: 78, fontSize: 9.5, fontWeight: 700, letterSpacing: 0.4, color: T.quiet, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.label}</span>
                      <div style={{ flex: 1, minWidth: 0, height: 10, borderRadius: 100, background: T.surface, overflow: 'hidden' }}>
                        <motion.div initial={reduce ? false : { width: 0 }} animate={{ width: `${Math.round((row.val / max) * 100)}%` }} transition={{ duration: 0.7, ease: EASE, delay: 0.2 }}
                          style={{ height: '100%', borderRadius: 100, background: row.hue }} />
                      </div>
                      <span style={{ flex: 'none', width: 38, textAlign: 'right', fontSize: 11, fontWeight: 800, color: row.ink, fontVariantNumeric: 'tabular-nums' }}>{nf(row.val)}</span>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>

        {/* Why this week looks like this — the real levers, named */}
        {vm.evidence.length > 0 && (
          <div style={band(20)}>
            <div style={{ ...cardBox(), gap: 14 }}>
              <div style={{ display: 'flex', gap: 9, alignItems: 'center' }}>
                <Gauge size={16} color={T.acid} />
                <span style={{ fontSize: 17, fontWeight: 700, color: T.ink }}>Warum genau so</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {vm.evidence.map((e, i) => (
                  <div key={e.key} style={{ display: 'flex', flexDirection: 'column', gap: 3, paddingTop: i === 0 ? 0 : 12, borderTop: i === 0 ? 'none' : `1px solid ${T.rule}` }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'baseline' }}>
                      <span style={{ minWidth: 0, fontSize: 10, fontWeight: 700, letterSpacing: 0.9, color: T.quiet, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.label}</span>
                      <span style={{ flex: 'none', fontSize: 13.5, fontWeight: 800, letterSpacing: -0.3, color: e.value === DASH ? T.quiet : T.ink }}>{e.value}</span>
                    </div>
                    <span style={{ fontSize: 12, fontWeight: 500, lineHeight: 1.45, color: T.mid }}>{e.note}</span>
                  </div>
                ))}
              </div>
              {vm.preface && (
                <div style={{ display: 'flex', gap: 9, padding: '12px 13px', borderRadius: 16, background: T.bg }}>
                  <Activity size={15} color={T.acid} style={{ flex: 'none', marginTop: 1 }} />
                  <span style={{ minWidth: 0, fontSize: 12, fontWeight: 500, lineHeight: 1.5, color: T.mid }}>{vm.preface}</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* The seven days, as prescribed */}
        {vm.planDays.length > 0 && (
          <div style={{ ...band(22), gap: 9 }}>
            <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1, color: T.quiet }}>{vm.planDaysLabel}</span>
            <div style={{ display: 'flex', flexDirection: 'column', borderRadius: 20, background: T.surface, overflow: 'hidden' }}>
              {vm.planDays.map((d, i) => (
                <div key={i} style={{ display: 'flex', gap: 11, alignItems: 'center', padding: '11px 14px', borderTop: i === 0 ? 'none' : `1px solid ${T.rule}` }}>
                  <span style={{ flex: 'none', width: 22, fontSize: 11, fontWeight: 800, letterSpacing: 0.4, color: d.rest ? T.quiet : T.acid }}>{d.letter}</span>
                  <span style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: d.rest ? 500 : 700, color: d.rest ? T.quiet : T.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.title}</span>
                  <span style={{ flex: 'none', fontSize: 11, fontWeight: 700, color: T.quiet, fontVariantNumeric: 'tabular-nums' }}>{d.tss}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Close the loop */}
        <div style={{ ...band(30), gap: 10, marginTop: 'auto' }}>
          <button onClick={onStart}
            style={{ height: 56, borderRadius: 100, border: 0, background: T.acid, color: T.bg, fontFamily: FONT, fontSize: 16, fontWeight: 700, letterSpacing: -0.2, cursor: 'pointer', display: 'flex', gap: 9, justifyContent: 'center', alignItems: 'center' }}>
            Woche starten<ArrowRight size={18} color={T.bg} />
          </button>
          <button onClick={onFullPlan}
            style={{ height: 46, borderRadius: 100, background: 'transparent', border: 0, fontFamily: FONT, fontSize: 13, fontWeight: 700, letterSpacing: 0.4, color: T.mid, cursor: 'pointer', display: 'flex', gap: 7, justifyContent: 'center', alignItems: 'center' }}>
            GANZEN TRAININGSPLAN ANSEHEN<Flame size={13} color={T.mid} />
          </button>
        </div>
      </div>
    </div>
  )
}

const cardBox = () => ({ background: T.surface, borderRadius: 24, padding: 20, display: 'flex', flexDirection: 'column' as const, width: '100%', minWidth: 0 })
