import { useLayoutEffect, useRef, useState } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { Gauge, Timer, TrendingUp, Zap } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { T, FONT, DASH } from './w3tokens'
import W3GrainSwitch, { type W3Grain } from './W3GrainSwitch'
import type { ActivityRhythm, RhythmGrain } from '../../api/rhythm'

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

/**
 * ── THE DOCK ZOOMS NOW ────────────────────────────────────────────────────
 *
 * It answered one question at one grain: how far this season. A rider who
 * wanted to know what the last week looked like had to read it off twelve
 * monthly bars, which is not reading, it is arithmetic.
 *
 * SAISON / MONAT / WOCHE re-values everything below it — the headline, the
 * meter, the bars and the three tiles all belong to the selected window. Same
 * control and same gesture as Erfolge (`W3GrainSwitch`), because two screens
 * letting a rider zoom the same data must not do it two different ways.
 *
 * THE BUCKET COUNT IS NOT FIXED. A season is twelve months, a week is seven
 * days, and a month is the ISO weeks covering the last thirty — five most
 * days, six on a Monday, when the window opens mid-week. Anything here that
 * counted bars would drop one; the chart renders whatever arrives.
 */
export interface W3RidesDockVm {
  /** Season distance, already localised ("4.812"). Null → an em dash. */
  totalKm: string | null
  totalUnit: string
  /** The rider's OWN season goal, or null → no goal exists. With no goal the
   *  season meter counts ridden months and the footer invites the rider to set
   *  one — it never fills against a target nobody chose. */
  goal: {
    chip: string
    ofGoalPct: string
    progress: number
    toGoLabel: string
    paceLabel: string
    paceAhead: boolean
  } | null
  /** Opens the season-goal editor (the footer button when `goal` is null,
   *  and the chip's affordance when one exists). */
  onSetGoal?: () => void
  /** Twelve months, normalised for height and carrying their own real values. */
  bars: number[]
  barMonths: { km: number; label: string; year: number }[]
  barsAccentFrom: number
  /** The three season averages. Always three, so the row never reflows. */
  stats: [W3RideStat, W3RideStat, W3RideStat]
  /** How far open the panel is, 0 → 1, driven by the page's own scroll. */
  expand?: number
  /** The three windows. Null while it loads — the dock then keeps its season
   *  behaviour rather than blanking, because a panel that empties on a slow
   *  read is worse than one that is briefly only a season. */
  rhythm?: ActivityRhythm | null
}

export interface W3RideStat {
  label: string
  value: string | null
  unit: string
}

/** How a bucket names itself, per grain: a month, the week it opens, a day. */
function bucketLabel(iso: string, grain: W3Grain): string {
  const d = new Date(`${iso}T00:00:00`)
  if (Number.isNaN(d.getTime())) return ''
  if (grain === 'season') return d.toLocaleDateString('de-DE', { month: 'short' }).toUpperCase()
  if (grain === 'month') return `AB ${d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })}`
  return d.toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit' }).toUpperCase()
}

/** The axis tick under a bar — one or two characters, never a date. */
function tickLabel(iso: string, grain: W3Grain): string {
  const d = new Date(`${iso}T00:00:00`)
  if (Number.isNaN(d.getTime())) return ''
  if (grain === 'season') return d.toLocaleDateString('de-DE', { month: 'narrow' })
  if (grain === 'month') return `${d.getDate()}.`
  return d.toLocaleDateString('de-DE', { weekday: 'narrow' })
}

const nf0 = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 0 })
const nf1 = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 1 })

const GRAINS: { key: W3Grain; label: string }[] = [
  { key: 'season', label: 'SAISON' },
  { key: 'month', label: 'MONAT' },
  { key: 'week', label: 'WOCHE' },
]

const STAT_ICON: Record<string, LucideIcon> = {
  'Ø TEMPO': Gauge,
  'Ø LEISTUNG': Zap,
  'SATTELZEIT': Timer,
  FAHRTEN: Gauge,
  STUNDEN: Timer,
  'HÖHENMETER': TrendingUp,
}

export default function W3RidesDock({ vm }: { vm: W3RidesDockVm }) {
  const open = Math.max(0, Math.min(1, vm.expand ?? 0))
  const reduce = useReducedMotion()
  const [grain, setGrain] = useState<W3Grain>('season')
  const [month, setMonth] = useState<number | null>(null)

  // The switch only appears once there is something to switch to. Offering
  // three tabs while the read is in flight would give two of them nothing.
  const rhythm = vm.rhythm ?? null
  const win: RhythmGrain | null = rhythm ? rhythm[grain] : null

  // Changing grain drops the selection: bar 3 is a different period in each,
  // and carrying the index across would silently re-point the headline.
  const choose = (g: W3Grain) => { setGrain(g); setMonth(null) }

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

  // ── what the bars are, at this grain ──────────────────────────────────
  // Heights are computed here against the window's own peak rather than taken
  // from `vm.bars`, which is a season-normalised series and would draw a
  // week's seven days against a year's biggest month.
  const buckets = win?.buckets ?? []
  const peak = Math.max(...buckets.map((b) => b.km), 1)
  const bars = win
    ? buckets.map((b) => b.km / peak)
    : vm.bars
  const picked = win
    ? (month != null && buckets[month]
        ? { km: buckets[month].km, label: bucketLabel(buckets[month].start, grain), year: 0 }
        : null)
    : (month != null ? vm.barMonths[month] : null)

  // ── what the meter means ──────────────────────────────────────────────
  // For the season it stays the goal, which is what this dock has always
  // promised and what the chip beside it names. A month and a week have no
  // goal, so there the meter answers the question they can answer: how much
  // of this window did you actually ride. Each is labelled, because a meter
  // that silently changes meaning is worse than two meters.
  const ridden = buckets.filter((b) => b.rides > 0).length
  // Season without a goal: the meter answers the same question the other
  // grains answer — how much of the window was actually ridden (months with
  // at least one ride). Labelled, like every other meaning change here.
  const monthsRidden = win ? ridden : vm.barMonths.filter((m) => m.km > 0).length
  const monthsTotal = win ? buckets.length : vm.barMonths.length
  const share = grain === 'season'
    ? (vm.goal ? Math.max(0, Math.min(1, vm.goal.progress)) : monthsTotal ? monthsRidden / monthsTotal : 0)
    : buckets.length ? ridden / buckets.length : 0
  const filled = Math.round(share * SEGMENTS)

  return (
    <div style={{
      width: '100%', background: T.heroDock, borderRadius: 28,
      // Smaller when closed, breathing out as it opens — the panel must not
      // push up into the back wheel of the bike standing above it.
      padding: `${12 + open * 4}px 16px ${12 + open * 4}px`,
      display: 'flex', flexDirection: 'column', gap: 10, fontFamily: FONT,
    }}>

      {/* ── which window ──────────────────────────────────────────────────
          Above the number, because it says what the number IS. Only once the
          three windows have arrived: a switch whose other two tabs resolve to
          nothing is worse than no switch. */}
      {rhythm && (
        <W3GrainSwitch
          value={grain}
          options={GRAINS}
          onChange={choose}
          layoutId="w3-rides-grain"
          track={T.heroOff}
          off={T.heroMid}
        />
      )}

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
          {picked
            ? nf0.format(Math.round(picked.km))
            : win ? nf0.format(Math.round(win.km)) : vm.totalKm ?? DASH}
        </span>
        <span style={{ fontSize: 15, fontWeight: 700, color: T.heroMid, paddingBottom: 2 }}>{vm.totalUnit}</span>
        <div style={{ marginLeft: 'auto', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 3 }}>
          {/* The chip NAMES THE METER, always. It is the season's goal on the
              season and the ridden share elsewhere, and an unlabelled meter
              that changes meaning would be the worst of both. */}
          <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: 1.2, color: T.heroMid }}>
            {picked
              ? picked.label
              : win && grain !== 'season' ? win.label.toUpperCase()
                : vm.goal ? vm.goal.chip : 'MONATE GEFAHREN'}
          </span>
          <span style={{ fontSize: 15, fontWeight: 700, letterSpacing: -0.4, color: T.acid }}>
            {picked
              ? `${nf0.format(picked.km)} km`
              : grain === 'season'
                ? (vm.goal ? vm.goal.ofGoalPct : `${monthsRidden}/${monthsTotal}`)
                : `${ridden}/${buckets.length}`}
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

        {/* THE WINDOW'S SHAPE — twelve months, five or six weeks, or seven
            days, whichever the switch is on. Each bar tappable, because the
            numbers are real and a chart holding real numbers should answer
            when it is asked. */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: 1.2, color: T.heroMid }}>
              {win
                ? grain === 'season' ? '12 MONATE' : grain === 'month' ? `${buckets.length} WOCHEN` : '7 TAGE'
                : '12 MONATE'}
            </span>
            <span style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: 0.4, color: picked ? T.acid : T.heroMid }}>
              {picked
                ? `${nf0.format(Math.round(picked.km))} km`
                : grain === 'week' ? 'tippen für den Tag' : grain === 'month' ? 'tippen für die Woche' : 'tippen für den Monat'}
            </span>
          </div>
          <div style={{ display: 'flex', gap: 4, height: 54, alignItems: 'flex-end' }}
            onPointerLeave={() => setMonth(null)}>
            {bars.map((b, i) => {
              const on = month === i
              // On a live window the last bar is the one still being written;
              // on the season series the accent starts where it always did.
              const recent = win ? i === bars.length - 1 : i >= vm.barsAccentFrom
              const empty = win ? (buckets[i]?.km ?? 0) <= 0 : false
              const label = win
                ? `${bucketLabel(buckets[i].start, grain)}: ${nf0.format(Math.round(buckets[i].km))} Kilometer`
                : `${vm.barMonths[i]?.label ?? ''}: ${Math.round(vm.barMonths[i]?.km ?? 0)} Kilometer`
              return (
                <button key={win ? buckets[i].start : i}
                  onPointerEnter={() => setMonth(i)}
                  onClick={() => setMonth(month === i ? null : i)}
                  aria-label={label}
                  aria-pressed={on}
                  style={{
                    flex: 1, minWidth: 0, height: '100%', padding: 0, border: 0, background: 'transparent',
                    display: 'flex', alignItems: 'flex-end', cursor: 'pointer',
                  }}>
                  <motion.span
                    initial={reduce ? false : { scaleY: 0 }} animate={{ scaleY: 1 }}
                    transition={{ duration: 0.45, delay: reduce ? 0 : i * 0.025, ease: [0.22, 1, 0.36, 1] }}
                    style={{
                      display: 'block', width: '100%', transformOrigin: 'bottom',
                      // An empty bucket is a visible stub in the track's own
                      // tone — a rest day is a fact, not an absence of one.
                      height: `${Math.max(9, Math.round(b * 100))}%`, borderRadius: 3,
                      background: on ? T.ink : empty ? T.heroOff : recent ? T.acid : T.heroOff,
                      boxShadow: on || (recent && !empty) ? `0 0 12px ${T.acid}33` : 'none',
                    }} />
                </button>
              )
            })}
          </div>
          {/* An axis only where the buckets are not self-evident. Twelve
              months read from their own accent; five weeks and seven days do
              not, and an unlabelled bar a rider cannot place is a decoration. */}
          {win && grain !== 'season' && (
            <div style={{ display: 'flex', gap: 4, width: '100%' }}>
              {buckets.map((b, i) => (
                <span key={b.start} style={{
                  flex: 1, minWidth: 0, textAlign: 'center', fontSize: 8, fontWeight: 700,
                  color: month === i ? T.ink : T.heroMid,
                }}>{tickLabel(b.start, grain)}</span>
              ))}
            </div>
          )}
        </div>

        {/* THE THREE TILES BELONG TO THE SELECTED WINDOW.
            They used to be season averages regardless of what the panel was
            showing, which is the defect the switch would otherwise have
            created: a rider taps WOCHE, the headline becomes seven days, and
            three tiles underneath keep quoting the year.

            They are counts and totals rather than the old Ø Tempo / Ø
            Leistung, because those are averages this payload does not carry
            per window — and a season average sitting under a week's headline
            is exactly the lie being fixed. Sattelzeit survives as STUNDEN. */}
        <div style={{ display: 'flex', gap: 8, width: '100%' }}>
          {(win ? [
            // Units stay SHORT. Rendered as "{label} · {unit}" in a third of
            // 390px, "FAHRTEN · gesamt" truncated to "FAHRTEN · ges…" — a
            // label that ellipsises is a label that failed.
            { label: 'FAHRTEN', value: nf0.format(win.rides), unit: '' },
            { label: 'STUNDEN', value: nf1.format(win.hours), unit: 'h' },
            // No unit: "HÖHENMETER · hm" still ellipsised at a third of
            // 390px, and the word already IS the unit.
            { label: 'HÖHENMETER', value: nf0.format(win.elevation_m), unit: '' },
          ] : vm.stats).map((s) => {
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
                  {s.unit ? `${s.label} · ${s.unit}` : s.label}
                </span>
              </div>
            )
          })}
        </div>

        {/* THE GOAL FOOTER IS THE SEASON'S. "noch 7.188 km" and "312 km vor
            Plan" are statements about the year; under a week's headline they
            are the same lie the tiles were telling before the switch made it
            visible. A month and a week are not behind or ahead of anything. */}
        {grain === 'season' && (
          vm.goal ? (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
              <button type="button"
                onClick={vm.onSetGoal ? (e) => { e.stopPropagation(); vm.onSetGoal?.() } : undefined}
                aria-label="Saisonziel ändern"
                style={{
                  background: 'none', border: 0, padding: 0, cursor: vm.onSetGoal ? 'pointer' : 'default',
                  fontFamily: FONT, fontSize: 9.5, fontWeight: 700, letterSpacing: 0.6, color: T.heroMid,
                  minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textAlign: 'left',
                }}>{vm.goal.toGoLabel}</button>
              <span style={{ display: 'inline-flex', gap: 5, alignItems: 'center', flex: 'none', fontSize: 9.5, fontWeight: 700, letterSpacing: 0.6, color: vm.goal.paceAhead ? T.acid : T.warn }}>
                <TrendingUp size={12} color={vm.goal.paceAhead ? T.acid : T.warn} style={{ transform: vm.goal.paceAhead ? 'none' : 'scaleY(-1)' }} />
                {vm.goal.paceLabel}
              </span>
            </div>
          ) : vm.onSetGoal ? (
            // The invitation, not the accusation: a rider without a goal is
            // not "behind" anything.
            <button type="button"
              onClick={(e) => { e.stopPropagation(); vm.onSetGoal?.() }}
              style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10,
                background: 'none', border: 0, padding: 0, cursor: 'pointer', fontFamily: FONT, width: '100%',
              }}>
              <span style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: 0.6, color: T.heroMid }}>KEIN SAISONZIEL GESETZT</span>
              <span style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: 0.6, color: T.acid }}>ZIEL SETZEN →</span>
            </button>
          ) : null
        )}
      </div>
    </div>
  )
}
