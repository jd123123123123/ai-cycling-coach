import { useLayoutEffect, useRef, useState } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { Gauge, Timer, TrendingUp, Zap } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { T, FONT, DASH } from './w3tokens'

/**
 * W3 · Fahrten — THE DOCK.
 *
 * The same idea as Today's readiness panel, asked of a different question. The
 * rides screen opens on ONE number — how far this season — and everything else
 * is the working behind it. Printing all of it on the first screen makes the
 * rider read a table to learn one thing.
 *
 * So the closed panel is the distance and its meter, and scrolling opens it
 * into the working: the season's shape as twelve tappable months, and the three
 * averages. The same gesture, in the same place, meaning what it means on
 * Today: "why that number".
 *
 * ── THE METER IS SEGMENTED, LIKE READINESS ───────────────────────────────
 * It was a continuous bar, which made it the one progress indicator in the app
 * that spoke a different language from the one above it on the other screen.
 * Twenty-two steps, same as the dock it sits beside: a rider reads "seventeen
 * of twenty-two" at a glance and cannot read a percentage off a smooth bar.
 *
 * ── THE CHART LIVES IN THE PANEL, NOT UNDER IT ───────────────────────────
 * The season card below used to carry the monthly bars. They belong to the
 * distance figure — they ARE that figure, spread over twelve months — so they
 * open with it. And they are tappable: a chart you cannot interrogate is a
 * decoration, and this one is holding twelve real numbers.
 */

const ARCHIVO = 'Archivo, "Inter Tight", sans-serif'

/** The pen's meter: 22 steps. Shared with `W3TodayDock` on purpose. */
const SEGMENTS = 22

export interface W3RidesDockVm {
  /** Season distance, already localised ("4.812"). Null → an em dash. */
  totalKm: string | null
  totalUnit: string
  /** How far through the season goal, 0..1, and how that reads as a share. */
  progress: number
  ofGoalPct: string
  goalChip: string
  toGoLabel: string
  paceLabel: string
  paceAhead: boolean
  /** Twelve months, normalised for height and carrying their own real values. */
  bars: number[]
  barMonths: { km: number; label: string; year: number }[]
  barsAccentFrom: number
  /** The three season averages. Always three, so the row never reflows. */
  stats: [W3RideStat, W3RideStat, W3RideStat]
  /** How far open the panel is, 0 → 1, driven by the page's own scroll. */
  expand?: number
}

export interface W3RideStat {
  label: string
  value: string | null
  unit: string
}

const STAT_ICON: Record<string, LucideIcon> = {
  'Ø TEMPO': Gauge,
  'Ø LEISTUNG': Zap,
  'SATTELZEIT': Timer,
}

export default function W3RidesDock({ vm }: { vm: W3RidesDockVm }) {
  const open = Math.max(0, Math.min(1, vm.expand ?? 0))
  const reduce = useReducedMotion()
  const [month, setMonth] = useState<number | null>(null)

  // MEASURED, NOT GUESSED. The open height was a hardcoded number and the
  // content outgrew it, so the bottom row of the panel was quietly cut in half.
  // Reading the content's own height means a longer label or a wrapped unit
  // cannot clip it again.
  const body = useRef<HTMLDivElement | null>(null)
  const [full, setFull] = useState(0)
  useLayoutEffect(() => {
    const el = body.current
    if (!el) return
    const measure = () => setFull(el.scrollHeight)
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const filled = Math.round(Math.max(0, Math.min(1, vm.progress)) * SEGMENTS)
  const picked = month != null ? vm.barMonths[month] : null

  return (
    <div style={{
      width: '100%', background: T.heroDock, borderRadius: 28,
      // Smaller when closed, breathing out as it opens — the panel must not
      // push up into the back wheel of the bike standing above it.
      padding: `${12 + open * 4}px 16px ${12 + open * 4}px`,
      display: 'flex', flexDirection: 'column', gap: 10, fontFamily: FONT,
    }}>

      {/* ── the number, and what it is a number of ── */}
      {/* A TAPPED MONTH TAKES THE HEADLINE. The big figure is whatever the
          rider is currently asking about: the season by default, that month
          while their finger is on it. Showing both at once would make the
          screen answer a question nobody asked. */}
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10, width: '100%', minWidth: 0 }}>
        <span style={{
          fontFamily: ARCHIVO, fontSize: 44, fontWeight: 700, letterSpacing: -2,
          lineHeight: 0.85, color: vm.totalKm || picked ? T.ink : T.heroOff,
          fontVariantNumeric: 'tabular-nums',
        }}>
          {picked ? Math.round(picked.km).toLocaleString('de-DE') : vm.totalKm ?? DASH}
        </span>
        <span style={{ fontSize: 15, fontWeight: 700, color: T.heroMid, paddingBottom: 2 }}>{vm.totalUnit}</span>
        <div style={{ marginLeft: 'auto', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 3 }}>
          <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: 1.2, color: T.heroMid }}>
            {picked ? `${picked.label.toUpperCase()} ${picked.year}` : vm.goalChip}
          </span>
          <span style={{ fontSize: 15, fontWeight: 700, letterSpacing: -0.4, color: T.acid }}>
            {picked ? 'MONAT' : vm.ofGoalPct}
          </span>
        </div>
      </div>

      {/* ── the meter: 22 steps, filled from the real share of the goal ── */}
      <div style={{ display: 'flex', gap: 3, width: '100%', height: 10 }}>
        {Array.from({ length: SEGMENTS }, (_, i) => (
          <motion.div key={i}
            initial={reduce ? false : { opacity: 0, scaleY: 0.4 }}
            animate={{ opacity: 1, scaleY: 1 }}
            transition={{ duration: 0.32, delay: reduce ? 0 : i * 0.012 }}
            style={{
              flex: 1, borderRadius: 2, transformOrigin: 'bottom',
              background: i < filled
                ? `linear-gradient(180deg, ${T.acidLite} 0%, ${T.acid} 55%, ${T.acidDeep} 100%)`
                : T.heroOff,
              boxShadow: i < filled ? `inset 0 1px 0 ${T.ink}40` : 'none',
            }} />
        ))}
      </div>

      {/* ── the working, revealed by the page's own scroll ── */}
      <div ref={body} style={{
        display: 'flex', flexDirection: 'column', gap: 12, width: '100%',
        height: full ? open * full : undefined, opacity: open, overflow: 'hidden',
        marginTop: open * 2, pointerEvents: open > 0.6 ? 'auto' : 'none',
      }}>

        {/* THE SEASON'S SHAPE. Twelve months, each one tappable — the numbers
            are real, so the chart is allowed to be asked about them. */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: 1.2, color: T.heroMid }}>
              12 MONATE
            </span>
            <span style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: 0.4, color: picked ? T.acid : T.heroMid }}>
              {picked ? `${Math.round(picked.km).toLocaleString('de-DE')} km` : 'tippen für den Monat'}
            </span>
          </div>
          <div style={{ display: 'flex', gap: 4, height: 54, alignItems: 'flex-end' }}
            onPointerLeave={() => setMonth(null)}>
            {vm.bars.map((b, i) => {
              const on = month === i
              const recent = i >= vm.barsAccentFrom
              return (
                <button key={i}
                  onPointerEnter={() => setMonth(i)}
                  onClick={() => setMonth(month === i ? null : i)}
                  aria-label={`${vm.barMonths[i]?.label ?? ''}: ${Math.round(vm.barMonths[i]?.km ?? 0)} Kilometer`}
                  style={{
                    flex: 1, minWidth: 0, height: '100%', padding: 0, border: 0, background: 'transparent',
                    display: 'flex', alignItems: 'flex-end', cursor: 'pointer',
                  }}>
                  <motion.span
                    initial={reduce ? false : { scaleY: 0 }} animate={{ scaleY: 1 }}
                    transition={{ duration: 0.45, delay: reduce ? 0 : i * 0.025, ease: [0.22, 1, 0.36, 1] }}
                    style={{
                      display: 'block', width: '100%', transformOrigin: 'bottom',
                      height: `${Math.max(9, Math.round(b * 100))}%`, borderRadius: 3,
                      background: on ? T.ink : recent ? T.acid : T.heroOff,
                      boxShadow: on || recent ? `0 0 12px ${T.acid}33` : 'none',
                    }} />
                </button>
              )
            })}
          </div>
        </div>

        {/* THE THREE AVERAGES, given weight. They were three grey captions in a
            row; each one is its own lit tile now, with the icon that says which
            question it answers before the number is read. */}
        <div style={{ display: 'flex', gap: 8, width: '100%' }}>
          {vm.stats.map((s) => {
            const Icon = STAT_ICON[s.label] ?? Gauge
            return (
              <div key={s.label} style={{
                flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 6,
                padding: '10px 11px', borderRadius: 16, background: T.heroChip,
              }}>
                <span style={{
                  width: 24, height: 24, borderRadius: 100, display: 'grid', placeItems: 'center',
                  background: T.acidDim,
                }}>
                  <Icon size={12} color={T.acid} />
                </span>
                <span style={{
                  fontFamily: ARCHIVO, fontSize: 19, fontWeight: 700, letterSpacing: -0.6,
                  color: s.value ? T.ink : T.heroOff, fontVariantNumeric: 'tabular-nums',
                  minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>{s.value ?? DASH}</span>
                <span style={{ fontSize: 8.5, fontWeight: 700, letterSpacing: 1, color: T.heroMid,
                  minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {s.label} · {s.unit}
                </span>
              </div>
            )
          })}
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: 0.6, color: T.heroMid, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{vm.toGoLabel}</span>
          <span style={{ display: 'inline-flex', gap: 5, alignItems: 'center', flex: 'none', fontSize: 9.5, fontWeight: 700, letterSpacing: 0.6, color: vm.paceAhead ? T.acid : T.warn }}>
            <TrendingUp size={12} color={vm.paceAhead ? T.acid : T.warn} style={{ transform: vm.paceAhead ? 'none' : 'scaleY(-1)' }} />
            {vm.paceLabel}
          </span>
        </div>
      </div>
    </div>
  )
}
