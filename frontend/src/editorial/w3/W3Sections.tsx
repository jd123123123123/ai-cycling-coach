import { createContext, useContext, useId, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, useReducedMotion } from 'motion/react'
import { Info, CloudSun, Check, Minus, TrendingUp, TrendingDown, Moon, Zap, ArrowRight, Sparkles, SlidersHorizontal, ChevronDown, Clock, Home, Flag, Calendar, ChevronRight, Timer, Gauge, Percent, Wind, Droplets, Thermometer, type LucideIcon } from 'lucide-react'
import { T, FONT, EASE, grow, Kicker, card, band, DASH } from './w3tokens'
import W3WhyButton from './W3WhyButton'
import W3DayRoute from './W3DayRoute'
import './w3TodayTrainingEditorial.css'

// ────────────────────────────────────────────────────────────────────────
// "Deine Woche" — ONE card: the week's day selector, the selected day's
// training, and the selected day's weather. Selecting a day drives all three.
// ────────────────────────────────────────────────────────────────────────
// ── the four-step day beam ──────────────────────────────────────────────
//
// A day's load used to be drawn as ONE tick whose height scaled continuously
// against the hardest day of that week. Two things were wrong with it. It was
// unreadable — nobody estimates 9 px against 14 px — and it was RELATIVE, so an
// easy week rescaled itself and its easiest ride drew the same tall tick as a
// race. The same effort looked different depending on the company it kept.
//
// Four steps fix both. You can count four. And the thresholds below are
// ABSOLUTE daily TSS, so a 60 TSS endurance hour lights two steps in every week
// of the year — which is the only way a rider can read the strip across weeks
// and see a block get harder.
//
// The cuts are the ones cyclists already say out loud about a day: under 50 is
// a recovery spin, 50-100 is an endurance ride, 100-150 is a real interval day,
// and past 150 is the long hard one you feel tomorrow. They were briefly 45/90/
// 135, which put the fixture's own 45 TSS "Erholungsfahrt" on two steps — the
// label and the beam disagreed on the same card.
const BEAM_STEPS = 4
const BEAM_SEG = 3
const BEAM_GAP = 2
const BEAM_CUTS = [1, 50, 100, 150]
const BEAM_COL: CSSProperties = {
  width: '58%',
  display: 'flex',
  flexDirection: 'column-reverse',
  gap: BEAM_GAP,
  // Reserve the full column whatever is lit, so the numbers above stay on one
  // baseline across the week.
  height: BEAM_STEPS * BEAM_SEG + (BEAM_STEPS - 1) * BEAM_GAP,
}

/** How many of the four steps this day's load lights. 0 for a rest day. */
export function beamSteps(tss: number): number {
  return BEAM_CUTS.filter((cut) => tss >= cut).length
}

/**
 * THE SPORTS THIS APP WILL NAME, in the rider's language.
 *
 * The load from a gym session or a run has always reached CTL, ATL and TSB —
 * `_compute_tss` scores every sport at ingestion and the PMC sums across them
 * on purpose. What was missing was the sentence: the week strip drew such a day
 * as trained, counted it against the week's budget, and then said nothing about
 * what it was. A rider saw a day marked done, carrying load, with dashes where
 * the session should be — the app had noticed their training everywhere except
 * on the screen.
 *
 * Unknown sports fall through to their own id rather than to a guess. A day
 * labelled `padel` is honest and slightly ugly; a day labelled "Training"
 * throws away the one fact this row exists to add.
 */
const SPORT_DE: Record<string, string> = {
  running: 'Laufen',
  strength_training: 'Krafttraining',
  swimming: 'Schwimmen',
  walking: 'Gehen',
  hiking: 'Wandern',
  rowing: 'Rudern',
  yoga: 'Yoga',
  elliptical: 'Crosstrainer',
  padel: 'Padel',
  tennis: 'Tennis',
  football: 'Fußball',
  skiing: 'Ski',
}

export type DayStatus = 'today' | 'hit' | 'missed' | 'over' | 'rest' | 'upcoming'
export interface W3DayFull {
  letter: string
  num: string
  actual: number        // real TSS ridden
  planned: number | null // planned TSS (null = no plan / rest)
  status: DayStatus
  title: string | null   // session name for that day
  dateLabel: string      // "Mo, 11. Aug"
  weekday: string        // "Samstag" — for the training header
  targetW: string        // recommendation target, e.g. "285 W" ("—" when none)
  ftpPct: string         // e.g. "98%"
  // The day's REAL power-profile bars, built from its planned interval blocks
  // (today, or a future day whose session is set). Optional: past days and the
  // preview fixture omit it, and the card falls back to today's bars.
  blocks?: W3Block[]
  // What was ACTUALLY ridden on a past day (from the day's real activity) — the
  // real duration / avg power / avg HR beside the planned-vs-done TSS bars.
  actualDurMin?: number | null
  actualW?: number | null
  actualHr?: number | null
  /** The sport, when the day's session was NOT a ride — null on a rest day and
   *  null on a ride, because a cycling app's week strip does not label the
   *  thing it is already about. Set, it changes two things below: the day says
   *  what it was, and the power column disappears. */
  actualSport?: string | null
  /** True when the PLAN prescribes rest, independently of `status`. Needed
   *  because `status` is 'today' for today whatever the day type is, so it
   *  cannot answer "is this a rest day?" for the one day that matters most. */
  rest?: boolean
}

export const STATUS: Record<DayStatus, { label: string; hue: string; icon: typeof Check }> = {
  today: { label: 'Heute', hue: T.acid, icon: TrendingUp },
  hit: { label: 'Geschafft', hue: T.acid, icon: Check },
  missed: { label: 'Verpasst', hue: T.warn, icon: Minus },
  over: { label: 'Zu viel', hue: T.cool, icon: TrendingUp },
  rest: { label: 'Ruhetag', hue: T.mid, icon: Minus },
  upcoming: { label: 'Geplant', hue: T.quiet, icon: Minus },
}

export interface W3WeekGoal { name: string; right: string; sub: string }

/** Hairline divider between the card's three zones. */
const Rule = () => <div style={{ height: 1, background: T.rule, width: '100%' }} />

// ────────────────────────────────────────────────────────────────────────
// Weather — ONE minimal line, and ONLY for today.
//   `/weather/today` is a TODAY-ONLY hourly forecast (backend/app/api/weather.py).
//   There is no multi-day forecast, so any other selected day says so plainly
//   rather than borrowing today's numbers. Past days get nothing at all — a
//   "ride now" window is meaningless once the day is gone.
// ────────────────────────────────────────────────────────────────────────
export interface W3Weather {
  /** Best 2-hour ride window today, "16:00–18:00" — or "—" when unavailable. */
  window: string
  temp: string
  feels: string
  /** Short real conditions line, "8 km/h SW · trocken". Null when unavailable. */
  short: string | null
  /** Ride-quality verdict for the best window. Null when there's no forecast. */
  verdict: string | null
  /** Honest explanation shown when there is no forecast at all. */
  meta: string
  /** Every hour `/weather/today` returned, ascending. Empty ⇒ no hourly detail
   *  and the zone falls back to the one-line summary. */
  hours: W3WeatherHour[]
  /** Inclusive hour bounds of the best window (17 and 18 for "17:00–19:00"). */
  bestFrom: number | null
  bestTo: number | null
  /** The better of the best window's two hours — the readout's default pick. */
  peak: number | null
}

/** One real forecast hour. Every measurement is nullable and renders "—" when
 *  missing — never 0, never interpolated. `q` is the SAME ride-quality score
 *  that picks the best window (W3TodayPage.hourQuality), and is null when the
 *  hour carries no readings at all, so an empty hour can't look perfect. */
export interface W3WeatherHour {
  hour: number          // 0–23, athlete-local
  q: number | null      // 0–1 ride quality
  temp: number | null   // °C
  rain: number | null   // precipitation probability, %
  code?: number | null // WMO forecast condition; absent stays unknown
  isDay?: boolean | null
  wind: number | null   // km/h
  dir: string | null    // 'SW'
  rideable: boolean     // inside the 07–21 daylight riding window
}

const hhmm = (h: number) => `${String(h).padStart(2, '0')}:00`

/** The day as bars — the readiness ChargeMeter's language (a row of rails,
 *  acid where it's "on") applied to the hourly forecast.
 *
 *  Why a scrubber and not labelled bars: 24 hours across the card's 314 usable
 *  px is ~11 px per bar. Three numbers on each is unreadable at 390, and three
 *  stacked tracks (wind/rain/temp) would make the reader integrate three charts
 *  to answer the only question that matters — "when do I ride". So the BARS
 *  answer that question alone (bar height = ride quality, acid = the best
 *  window), and the numbers live in ONE readout that follows your finger.
 *  Default selection is the best window's peak hour, so the resting state
 *  already shows the numbers behind the recommendation. */
function WeatherDay({ w }: { w: W3Weather }) {
  const reduce = useReducedMotion()
  const trackRef = useRef<HTMLDivElement>(null)
  const drag = useRef(false)
  const hours = w.hours
  const [sel, setSel] = useState<number>(w.peak ?? hours[0].hour)
  const idx = Math.max(0, hours.findIndex((h) => h.hour === sel))
  const cur = hours[idx]
  const inBest = w.bestFrom != null && w.bestTo != null && cur.hour >= w.bestFrom && cur.hour <= w.bestTo
  const H = 46

  const pickAt = (clientX: number) => {
    const el = trackRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const i = Math.floor(((clientX - r.left) / r.width) * hours.length)
    setSel(hours[Math.min(hours.length - 1, Math.max(0, i))].hour)
  }
  const step = (d: number) => setSel(hours[Math.min(hours.length - 1, Math.max(0, idx + d))].hour)

  // Best-window underline: index bounds inside the hour list (the list may not
  // start at 00, so positions are computed from indices, not from the clock).
  const fromI = w.bestFrom != null ? hours.findIndex((h) => h.hour === w.bestFrom) : -1
  const toI = w.bestTo != null ? hours.findIndex((h) => h.hour === w.bestTo) : -1

  const metrics: { icon: LucideIcon; v: string; l: string }[] = [
    { icon: Wind, v: cur.wind != null ? `${Math.round(cur.wind)} km/h` : DASH, l: cur.dir ?? 'WIND' },
    { icon: Droplets, v: cur.rain != null ? `${Math.round(cur.rain)}%` : DASH, l: 'REGEN' },
    { icon: Thermometer, v: cur.temp != null ? `${Math.round(cur.temp)}°` : DASH, l: 'TEMP' },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {/* the day, hour by hour */}
      <div
        ref={trackRef}
        role="slider" tabIndex={0}
        aria-label="Stunde wählen"
        aria-valuemin={hours[0].hour} aria-valuemax={hours[hours.length - 1].hour}
        aria-valuenow={cur.hour} aria-valuetext={`${hhmm(cur.hour)}${inBest ? ' · bestes Fenster' : ''}`}
        onPointerDown={(e) => { drag.current = true; e.currentTarget.setPointerCapture(e.pointerId); pickAt(e.clientX) }}
        onPointerMove={(e) => { if (drag.current) pickAt(e.clientX) }}
        onPointerUp={() => { drag.current = false }}
        onPointerCancel={() => { drag.current = false }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowRight') { e.preventDefault(); step(1) }
          if (e.key === 'ArrowLeft') { e.preventDefault(); step(-1) }
        }}
        // pan-y: a vertical swipe still scrolls the page; only sideways drags scrub.
        style={{ display: 'flex', gap: 2, alignItems: 'flex-end', height: H, width: '100%', touchAction: 'pan-y', cursor: 'pointer' }}>
        {hours.map((h, i) => {
          const best = w.bestFrom != null && w.bestTo != null && h.hour >= w.bestFrom && h.hour <= w.bestTo
          const on = h.hour === sel
          // No readings ⇒ a flat stub, never a full-height bar built from nothing.
          const fill = h.q == null ? 3 : Math.max(6, Math.round(h.q * H))
          return (
            <div key={h.hour} style={{ flex: 1, minWidth: 0, height: H, display: 'flex', alignItems: 'flex-end', borderRadius: 3, background: T.surface2, opacity: h.rideable ? 1 : 0.45, outline: on ? `1px solid ${T.d4}` : 'none', outlineOffset: 1 }}>
              <motion.div
                initial={reduce ? false : { height: 0 }} animate={{ height: fill }} transition={grow(i * 0.015)}
                style={{ width: '100%', height: fill, borderRadius: 3, background: best ? T.acid : h.q == null ? T.d2 : h.rideable ? T.d3 : T.d2, boxShadow: best ? `0 0 10px ${T.acid}55` : 'none' }} />
            </div>
          )
        })}
      </div>

      {/* the best stretch, marked under the bars it belongs to */}
      <div style={{ position: 'relative', height: 2, width: '100%' }}>
        {fromI >= 0 && toI >= fromI && (
          <div style={{ position: 'absolute', top: 0, left: `${(fromI / hours.length) * 100}%`, width: `${((toI - fromI + 1) / hours.length) * 100}%`, height: 2, borderRadius: 2, background: T.acid }} />
        )}
      </div>

      {/* morning / midday / evening, placed on their real hours */}
      <div style={{ position: 'relative', height: 11, width: '100%' }}>
        {([[8, 'MORGENS'], [13, 'MITTAGS'], [19, 'ABENDS']] as [number, string][]).map(([hr, label]) => {
          const i = hours.findIndex((h) => h.hour === hr)
          if (i < 0) return null
          return (
            <span key={label} style={{ position: 'absolute', left: `${((i + 0.5) / hours.length) * 100}%`, transform: 'translateX(-50%)', fontSize: 8.5, fontWeight: 700, letterSpacing: 0.8, color: T.quiet, whiteSpace: 'nowrap' }}>{label}</span>
          )
        })}
      </div>

      {/* the scrubbed hour's real numbers — one row, not 24 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', borderRadius: 14, background: T.surface2 }}>
        <div style={{ flex: 'none', width: 50, display: 'flex', flexDirection: 'column', gap: 1 }}>
          <span style={{ fontSize: 14, fontWeight: 700, letterSpacing: -0.3, fontVariantNumeric: 'tabular-nums', color: inBest ? T.acid : T.ink }}>{hhmm(cur.hour)}</span>
          <span style={{ fontSize: 8.5, fontWeight: 700, letterSpacing: 0.8, color: inBest ? T.acid : T.quiet }}>{inBest ? 'BESTES' : 'UHR'}</span>
        </div>
        {/* ONE LINE, NO ICONS. This was three columns, each an icon beside a
            value above a caps label — nine elements for three facts, directly
            under a card that had already spent four boxes on four numbers. The
            hero's rule is that supporting facts are a sentence, not a grid:
            "8 km/h SW · 5 % Regen · 20°" says the same thing in one breath and
            gives the row back to the hour strip above it, which is the part a
            rider actually reads. */}
        <span style={{
          fontSize: 12.5, fontWeight: 600, color: T.mid, lineHeight: 1.4,
          fontVariantNumeric: 'tabular-nums', minWidth: 0,
        }}>
          {metrics.map((m, i) => (
            <span key={m.l}>
              {i > 0 && <span style={{ color: T.quiet }}> · </span>}
              <span style={{ color: m.v !== DASH ? T.ink : T.quiet }}>{m.v}</span>
              <span style={{ color: T.quiet }}> {asWord(m.l)}</span>
            </span>
          ))}
        </span>
      </div>
    </div>
  )
}

/**
 * `compact` is the REST-DAY form. The full line answers "when should I go
 * out" — a best 2-hour window, a ride-quality verdict, and the whole day as
 * hourly bars. On a day the plan has set aside for recovery that is the app
 * arguing with itself: the card above says Ruhetag and the frame below it
 * picks the perfect hour to ride. Worse, "RAUS DAMIT" next to 0 TSS reads as
 * permission the plan did not give.
 *
 * A rest day is still a day, though, and that is why this shortens rather than
 * disappears: a rider deciding whether to walk, commute or just look out of the
 * window still wants the conditions. So compact keeps the FACTS — temperature
 * and the short conditions line — and drops the recommendation: no window, no
 * verdict chip, no hourly chart.
 */
function WeatherLine({ w, isToday, dateLabel, compact = false }: {
  w: W3Weather; isToday: boolean; dateLabel: string; compact?: boolean
}) {
  if (!isToday) {
    return (
      <div style={{ display: 'flex', gap: 9, alignItems: 'flex-start' }}>
        <CloudSun size={14} color={T.quiet} style={{ flex: 'none', marginTop: 1 }} />
        <span style={{ flex: 1, minWidth: 0, fontSize: 11.5, fontWeight: 500, lineHeight: 1.4, color: T.quiet }}>
          Für {dateLabel} gibt es noch keine Vorhersage — das Wetter kommt nur für heute.
        </span>
      </div>
    )
  }
  const has = w.verdict != null && w.window !== '—'
  if (!has) {
    return (
      <div style={{ display: 'flex', gap: 9, alignItems: 'flex-start' }}>
        <CloudSun size={14} color={T.quiet} style={{ flex: 'none', marginTop: 1 }} />
        <span style={{ flex: 1, minWidth: 0, fontSize: 11.5, fontWeight: 500, lineHeight: 1.4, color: T.quiet }}>{w.meta}</span>
      </div>
    )
  }
  if (compact) {
    const facts = [w.temp, w.short].filter(Boolean).join(' · ')
    return (
      <div style={{ display: 'flex', gap: 9, alignItems: 'center' }}>
        <CloudSun size={14} color={T.quiet} style={{ flex: 'none' }} />
        <span style={{ flex: 1, minWidth: 0, fontSize: 11.5, fontWeight: 500, lineHeight: 1.4, color: T.quiet, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {facts || w.meta}
        </span>
      </div>
    )
  }
  // With real hours we show the WHOLE day as bars and the numbers per hour; the
  // one-line summary stays as the fallback for a forecast without hourly detail.
  const day = w.hours.length > 0
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: day ? 12 : 7 }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        <CloudSun size={15} color={T.mid} style={{ flex: 'none' }} />
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
          <Kicker>Bestes Fenster</Kicker>
          <span style={{ fontSize: 16, fontWeight: 700, letterSpacing: -0.3, color: T.ink, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{w.window}</span>
        </div>
        {!day && (
          <div style={{ flex: 'none', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 }}>
            <span style={{ fontSize: 16, fontWeight: 700, letterSpacing: -0.3, color: T.ink }}>{w.temp}</span>
            <span style={{ fontSize: 9, fontWeight: 600, letterSpacing: 0.6, color: T.quiet }}>gefühlt {w.feels}</span>
          </div>
        )}
        <span style={{ flex: 'none', fontSize: 9, fontWeight: 700, letterSpacing: 1, color: T.mid, padding: '6px 9px', borderRadius: 100, background: T.surface2 }}>{w.verdict}</span>
      </div>
      {day ? <WeatherDay w={w} /> : w.short && <span style={{ fontSize: 11, fontWeight: 500, lineHeight: 1.35, color: T.quiet }}>{w.short}</span>}
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────────
// Training — the selected day's session, living INSIDE the week card.
//   • today   → plan + interval bars + weather + Start + adapt
//   • future  → the plan only, marked "Geplant"
//   • past+ridden → plan vs. what was actually ridden (Δ TSS + verdict)
//   • past+skipped → the plan, marked "Missed"
// ────────────────────────────────────────────────────────────────────────
export interface W3Block { w: number; work: boolean; label: string }
export interface TodaySession {
  dur: string | null; blocks: W3Block[]; ftpTag: string; earn: string | null
}

export function IntervalBars({ blocks, ftpTag, h = 96, editorial = false }: { blocks: W3Block[]; ftpTag: string; h?: number; editorial?: boolean }) {
  const reduce = useReducedMotion()
  const [hov, setHov] = useState<number | null>(null)
  return (
    <div style={{ position: 'relative', height: h, display: 'flex', gap: 2, alignItems: 'flex-end', width: '100%' }}>
      {blocks.map((b, i) => {
        const bh = Math.round(b.w * h)
        const on = hov === i
        return (
          <motion.div key={i} onMouseEnter={() => setHov(i)} onMouseLeave={() => setHov(null)}
            initial={reduce ? false : { height: 0 }} animate={{ height: bh }} transition={grow(i * 0.05)}
            // Work bars want 34px but MUST be allowed to shrink — a long session
            // (6 reps + recoveries) would otherwise overflow a 390px card.
            style={{
              flex: b.work ? '0 1 34px' : '1 1 18px', minWidth: 0, height: bh, cursor: 'pointer',
              // ROUNDED AT THE TOP, FLAT ON THE BASELINE. A bar is a column
              // standing on a floor, so only the end away from the floor is
              // rounded — rounding the base would lift it off the line it is
              // measured against. 4px per the mark spec, up from 3.
              borderRadius: '4px 4px 0 0',
              // LIT FROM ABOVE, like everything else in this app. The gradient
              // runs light at the top into the deeper acid at the base, which is
              // the same direction the stage's key light falls — so a bar reads
              // as a solid with a lit face rather than as a filled rectangle.
              background: editorial ? (b.work ? T.acid : T.heroOff) : b.work
                ? `linear-gradient(180deg, ${T.acid} 0%, ${T.acid} 30%, ${T.acidDeep} 100%)`
                : `linear-gradient(180deg, ${T.heroOff} 0%, ${T.heroDock} 100%)`,
              // The contact shadow that made the bike stand, at bar scale: a
              // dark pool where the column meets the floor, plus the thinnest
              // specular along its top edge. Work bars only — a recovery block
              // should sit BACK, and light is what puts it there.
              boxShadow: !editorial && b.work
                ? `inset 0 1px 0 ${T.ink}59, 0 2px 6px ${T.acidDeep}4D`
                : 'none',
              outline: on ? `1px solid ${T.ink}` : 'none',
            }} />
        )
      })}
      {/* THE FLOOR THE COLUMNS STAND ON. Recessive, per the mark spec: it is a
          reference, not a mark, and it was competing with the data at 66%. */}
      <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 1, background: T.rule }} />
      <div style={{ position: 'absolute', top: Math.round(h * 0.19), left: 0, right: 0, height: 1, background: T.stroke }} />
      <span style={{ position: 'absolute', top: 2, left: 0, fontSize: 9, fontWeight: 600, letterSpacing: 1, color: T.mid, maxWidth: '100%', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {hov != null ? blocks[hov].label : ftpTag}
      </span>
    </div>
  )
}

export const TrainingSelectionContext = createContext<{
  selection: { key: string; index: number | null } | null;
  setSelection: (value: { key: string; index: number | null }) => void;
} | null>(null)

/** The same prescription instrument in the quick view and its open detail.
 * Blocks retain their provided relative heights. Equal horizontal slots are
 * schematic sections: W3Block does not carry a reliable duration or axis unit. */
export function TrainingInstrument({ title, blocks, duration, target, tss, ftpPct, ftpTag, accessory }: {
  title: string; blocks: W3Block[]; duration?: string | null; target?: string | null;
  tss?: number | null; ftpPct?: string | null; ftpTag?: string | null; accessory?: ReactNode;
}) {
  const [localSelected, setLocalSelected] = useState<number | null>(null)
  const [showBasis, setShowBasis] = useState(false)
  const basisId = useId()
  const shared = useContext(TrainingSelectionContext)
  const selectionKey = `${title}|${blocks.map(b => `${b.label}:${b.w}`).join('|')}`
  const selected = shared ? (shared.selection?.key === selectionKey ? shared.selection.index : null) : localSelected
  const setSelected = (index: number | null) => shared ? shared.setSelection({ key: selectionKey, index }) : setLocalSelected(index)
  const phases = blocks.reduce((count, block, i) => count + (block.work && !blocks[i - 1]?.work ? 1 : 0), 0)
  const selectedBlock = selected == null ? null : blocks[selected]
  const phaseReading = phases > 1 ? `${phases} Belastungsphasen mit Erholung` : phases === 1 ? 'Eine zusammenhängende Belastungsphase' : 'Deine geplanten Abschnitte'
  const power = target && target !== DASH ? target : null
  const percent = ftpPct && ftpPct !== DASH ? `${ftpPct} FTP` : null
  return <div className="w3-training-instrument" style={{
    '--instrument-ink': T.ink, '--instrument-mid': T.mid, '--instrument-acid': T.acid,
    '--instrument-off': T.heroOff, '--instrument-rule': T.rule,
  } as CSSProperties}>
    <div className="w3-training-instrument-heading"><div className="w3-training-instrument-title">{title}</div>{accessory}</div>
    {(power || duration) && <div className="w3-training-instrument-readings">
      {power && <div><strong>{power}</strong><span>Ziel{percent ? ` · ${percent}` : ''}</span></div>}
      {duration && <div><strong>{duration}</strong><span>Dauer{tss != null ? ` · ${numTraining(tss)} TSS` : ''}</span></div>}
    </div>}
    {(!duration && tss != null || !power && percent) && <div className="w3-training-instrument-extra">{[!duration && tss != null ? `${numTraining(tss)} TSS` : null, !power ? percent : null].filter(Boolean).join(' · ')}</div>}
    {blocks.length > 0 && <>
      <div className="w3-training-instrument-profile" role="group" aria-description="Schematische Abschnitte, keine Zeitachse. Balkenbreite ist keine Dauer." aria-label={`Trainingsprofil: ${blocks.map(b => b.label).join(', ')}`}>
        {blocks.map((block, i) => <button type="button" key={i} aria-pressed={selected === i}
          aria-label={`Abschnitt ${i + 1}: ${block.label}`} title={block.label}
          onClick={() => setSelected(selected === i ? null : i)}
          className="w3-training-instrument-block" data-work={block.work}
          style={{ '--block-height': `${Math.max(2, Math.min(100, block.w * 100))}%` } as CSSProperties}>
          <span aria-hidden />
        </button>)}
      </div>
      <div className="w3-training-instrument-caption" aria-live="polite">
        <span>{selectedBlock?.label ?? phaseReading}</span>
        <button type="button" className="w3-training-instrument-info" aria-label="Profil erklären" aria-expanded={showBasis} aria-controls={basisId} onClick={() => setShowBasis(!showBasis)} title="Schematische Abschnitte, keine Zeitachse"><Info size={16} /></button>
      </div>
    </>}
    {showBasis && <p id={basisId} className="w3-training-instrument-basis">{ftpTag ? `${ftpTag}. ` : ''}Abschnitte schematisch; Balkenbreite ist keine Dauer. Tippe einen Abschnitt für seine Vorgabe an.</p>}
  </div>
}
const numTraining = (value: number) => value.toLocaleString('de-DE', { maximumFractionDigits: 1 })

export type Adapt = 'none' | 'easier' | 'harder' | 'shorter' | 'indoor' | 'rest'

/** A real coach re-plan result. For the intensity/exchange options `onAdapt`
 *  PERSISTS the change (POST /workouts/today/modify) and the numbers/`title`
 *  come from the modifier + the refreshed week. Rest is deterministic (0 TSS).
 *  Returns null when the day has no plan to adapt. */
export interface AdaptResult { targetW: string; tss: number | null; ftpPct: string; rationale: string; railsDowngraded: boolean; title?: string | null }
export type OnAdapt = (kind: Exclude<Adapt, 'none'>) => Promise<AdaptResult | null>

interface DayStat { icon: LucideIcon; v: string; l: string; hue?: string }


/**
 * A caps kicker, as it should read INSIDE a sentence.
 *
 * The fact lines are prose, and prose has casing rules: German nouns are
 * capitalised and acronyms stay upper. Lowercasing the kicker mechanically —
 * which is what the first version of this did — produced "112 tss · 98% der
 * ftp", which reads as a typo rather than as a quiet label.
 */
const SENTENCE_LABEL: Record<string, string> = {
  DAUER: 'Dauer',
  ZIEL: 'Ziel',
  TSS: 'TSS',
  'DER FTP': 'der FTP',
  REGEN: 'Regen',
  TEMP: 'Temp',
  WIND: 'Wind',
}

/** Falls back to the label unchanged: a wind direction like "SW" is already
 *  correct, and an unknown label is safer left alone than transformed. */
const asWord = (label: string) => SENTENCE_LABEL[label] ?? label

/**
 * The session's numbers, in the hero's grammar.
 *
 * WHAT THIS REPLACES. Four `StatCard`s in a 2x2 grid: four framed boxes, each
 * with an icon in a rounded chip, a value and a caps label — sixteen elements
 * to say four things. It is the "framed object" idiom, and the hero rejects it
 * on purpose: up there the bike stands in a room and the readiness panel is one
 * flat tone with no edge. A grid of bevelled tiles halfway down the same screen
 * is a different app.
 *
 * THE HERO'S GRAMMAR IS: one number leads, the label is whispered, everything
 * else is one quiet line. So the target power gets the size — it is the number
 * you actually ride to — and duration, TSS and %FTP become a single sentence of
 * facts under it. Four boxes and four icons become one number and one line, and
 * the ~40px of height that buys goes to the interval profile, which is the
 * thing you read to know what the ride IS.
 *
 * `hue` still marks a number the coach has just re-planned, and a missing value
 * still reads as an em dash in `T.quiet` — an adapted-but-unknown number can
 * never look like a real one.
 */
function SessionNumbers({ stats }: { stats: DayStat[] }) {
  if (!stats.length) return null
  // The lead is the target if there is one, else whatever came first: the
  // prescription's headline number, never an arbitrary slot.
  const lead = stats.find((s) => s.l === 'ZIEL') ?? stats[0]
  const rest = stats.filter((s) => s !== lead && s.v !== DASH)
  const has = lead.v !== DASH


  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
      <span style={{
        fontSize: 40, fontWeight: 700, letterSpacing: -1.4, lineHeight: 0.95,
        color: has ? (lead.hue ?? T.ink) : T.quiet, fontVariantNumeric: 'tabular-nums',
      }}>{lead.v}</span>
      <Kicker>{lead.l}</Kicker>
      {rest.length > 0 && (
        <span style={{
          fontSize: 12.5, fontWeight: 600, color: T.mid, lineHeight: 1.45,
          fontVariantNumeric: 'tabular-nums', minWidth: 0, marginTop: 2,
        }}>
          {rest.map((s, i) => (
            <span key={s.l}>
              {i > 0 && <span style={{ color: T.quiet }}> · </span>}
              <span style={{ color: s.hue ?? T.ink }}>{s.v}</span>
              <span style={{ color: T.quiet }}> {asWord(s.l)}</span>
            </span>
          ))}
        </span>
      )}
    </div>
  )
}

/** Past-day planned-vs-done — a visual two-bar comparison (no overflowing
 *  number columns): the plan and what was actually ridden on the same scale,
 *  with the delta and a short verdict. */
function PlannedVsDone({ day, reduce }: { day: W3DayFull; reduce: boolean | null }) {
  const planned = day.planned ?? 0
  const actual = day.actual
  const max = Math.max(planned, actual, 1)
  const delta = planned > 0 ? actual - planned : null
  const over = day.status === 'over'
  const doneHue = over ? T.cool : T.acid
  const rows: { label: string; val: number; hue: string; dashed?: boolean }[] = [
    { label: 'Geplant', val: planned, hue: T.d3, dashed: true },
    { label: 'Gefahren', val: actual, hue: doneHue },
  ]
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {rows.map((r) => (
          <div key={r.label} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ width: 62, flex: 'none', fontSize: 10, fontWeight: 700, letterSpacing: 0.8, textTransform: 'uppercase', color: T.quiet }}>{r.label}</span>
            <div style={{ flex: 1, minWidth: 0, height: 14, borderRadius: 100, background: '#FFFFFF0A', overflow: 'hidden' }}>
              <motion.div
                initial={reduce ? false : { width: 0 }} animate={{ width: `${Math.round((r.val / max) * 100)}%` }} transition={{ duration: 0.6, ease: EASE }}
                style={{ height: '100%', borderRadius: 100, background: r.dashed ? 'transparent' : r.hue, border: r.dashed ? `1.5px dashed ${T.d3}` : 'none' }} />
            </div>
            <span style={{ width: 42, flex: 'none', textAlign: 'right', fontSize: 15, fontWeight: 800, letterSpacing: -0.4, color: r.dashed ? T.mid : r.hue, fontVariantNumeric: 'tabular-nums' }}>{Math.round(r.val)}</span>
          </div>
        ))}
      </div>
      {/* What you actually DID — real duration / avg power / avg HR. */}
      {(day.actualDurMin != null || day.actualW != null || day.actualHr != null) && (
        <div style={{ display: 'flex', gap: 8, paddingTop: 12, borderTop: `1px solid ${T.rule}` }}>
          {[
            ['DAUER', day.actualDurMin != null ? `${Math.floor(day.actualDurMin / 60)}:${String(Math.round(day.actualDurMin % 60)).padStart(2, '0')}` : '—'],
            // THE COLUMN IS DROPPED, NOT DASHED. A gym session has no power to
            // report and an empty cell under Ø LEISTUNG does not read as "this
            // sport has no watts" — it reads as a ride whose power meter failed.
            // Watts on a run would be worse still: a running-power number in a
            // column that is read against an FTP is a different quantity wearing
            // the same unit.
            ...(day.actualSport ? [] : [
              ['Ø LEISTUNG', day.actualW != null ? `${Math.round(day.actualW)} W` : '—'],
            ]),
            ['Ø HF', day.actualHr != null ? `${Math.round(day.actualHr)}` : '—'],
          ].map(([l, v]) => (
            <div key={l} style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3, padding: '10px 12px', borderRadius: 14, background: T.surface2 }}>
              <span style={{ fontSize: 15, fontWeight: 800, letterSpacing: -0.4, color: v === '—' ? T.quiet : T.ink }}>{v}</span>
              <span style={{ fontSize: 8, fontWeight: 700, letterSpacing: 0.8, color: T.quiet }}>{l}</span>
            </div>
          ))}
        </div>
      )}
      {/* And it says what it was — quiet, because the day already carries its
          numbers above and this line only has to stop them being misread as a
          ride's. Nothing is drawn on a ride: labelling every cycling day
          "Radfahren" in a cycling app is noise. */}
      {day.actualSport && (
        <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10, fontWeight: 700, letterSpacing: 0.6, color: T.quiet }}>
          <span style={{ width: 5, height: 5, borderRadius: 100, background: T.mid, flex: 'none' }} />
          {(SPORT_DE[day.actualSport] ?? day.actualSport).toUpperCase()}
        </span>
      )}
      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        {delta != null && (
          <span style={{ flex: 'none', display: 'flex', gap: 5, alignItems: 'center', padding: '5px 11px', borderRadius: 100, background: `${doneHue}1F`, fontSize: 11, fontWeight: 800, color: doneHue }}>
            {over ? <TrendingUp size={12} /> : <Check size={12} />}{delta > 0 ? '+' : ''}{delta} TSS
          </span>
        )}
        <span style={{ flex: 1, minWidth: 0, fontSize: 11.5, fontWeight: 600, lineHeight: 1.35, color: T.mid }}>
          {over ? 'Über dem Plan — achte morgen auf die Ermüdung.' : 'Genau auf den Punkt. So wächst Fitness.'}
        </span>
      </div>
    </div>
  )
}

/** The selected day's training, weather and actions — the lower two thirds of
 *  the week card. Mounted with a per-day key, so switching days resets the
 *  adapt state and replays the entrance. */
export function DayTraining({ day, session, weather, onAdapt, appearance }: { day: W3DayFull; session: TodaySession; weather: W3Weather; onAdapt?: OnAdapt; appearance?: 'editorial' }) {
  const [adapt, setAdapt] = useState<Adapt>('none')
  const [busy, setBusy] = useState<Adapt>('none')
  const [result, setResult] = useState<AdaptResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showAdapt, setShowAdapt] = useState(false)
  const navigate = useNavigate()
  const reduce = useReducedMotion()
  const isToday = day.status === 'today'
  // Opted in by the primary Today slot; week/session consumers stay unchanged.
  const editorial = appearance === 'editorial'
  const editorialClass = editorial ? 'w3-today-training-editorial' : undefined
  const editorialTokens = editorial ? {
    '--today-training-surface': T.surface,
    '--today-training-mid': T.mid,
    '--today-training-acid': T.acid,
  } as CSSProperties : undefined
  // "1 Std. 15 min" / "45 min" → minutes. The session states its duration as
  // display copy, which is the only place it exists on this card; a route
  // matched on TSS alone would ignore whether the ride even fits the evening.
  const durMinutes = (() => {
    const s = result?.title ? null : session.dur
    if (!s) return null
    const h = /(\d+)\s*Std/.exec(s)
    const m = /(\d+)\s*min/.exec(s)
    const total = (h ? Number(h[1]) * 60 : 0) + (m ? Number(m[1]) : 0)
    return total > 0 ? total : null
  })()
  const isPast = day.status === 'hit' || day.status === 'over' || day.status === 'missed' || day.status === 'rest'
  const isFuture = day.status === 'upcoming'
  const st = STATUS[day.status]
  const StIcon = st.icon
  // Quiet by default: only a genuinely off-plan day earns a coloured chip, so
  // the card keeps exactly one acid voice (today / the CTA).
  const chipHue = day.status === 'missed' ? T.warn : day.status === 'over' ? T.cool : T.mid
  const chipBg = day.status === 'missed' || day.status === 'over' ? `${chipHue}1F` : T.surface2

  // Base numbers are the plan's; when the coach has re-planned (`result`), its
  // values win. No client-side scaling — the AI owns the adapted target.
  const baseT = parseInt(day.targetW) || 0
  const baseTss = day.planned ?? 0
  const baseFtp = parseInt(day.ftpPct) || 0
  const curT = result ? (parseInt(result.targetW) || baseT) : baseT
  const curTss = result ? (result.tss ?? baseTss) : baseTss
  const curFtp = result ? (parseInt(result.ftpPct) || baseFtp) : baseFtp
  const isRest = adapt === 'rest'
  const adapted = adapt !== 'none'
  const profileStale = !!result?.title && result.title !== day.title
  // The four supporting numbers. Duration is today-only (the view only knows
  // today's session length), so other days show three and the last card spans
  // the row rather than leaving a hole in the grid.
  const replanned = adapted && isToday ? T.acid : undefined
  const stats: DayStat[] = [
    ...(isToday && session.dur ? [{ icon: Timer, v: session.dur, l: 'DAUER' }] : []),
    { icon: Zap, v: curT ? `${curT} W` : DASH, l: 'ZIEL', hue: replanned },
    { icon: Gauge, v: curTss ? `${curTss}` : DASH, l: 'TSS', hue: replanned },
    { icon: Percent, v: curFtp ? `${curFtp}%` : DASH, l: 'DER FTP' },
  ]
  // How to ride it + fuelling (the 60 g/h is standard endurance guidance, not a
  // fabricated per-ride number).
  const tw = editorial && curT ? `${curT} W` : day.targetW && day.targetW !== '—' ? day.targetW : 'im Zielbereich'
  const workDesc = `Intervalle bei ${tw} halten · locker ein- und ausfahren · ~60 g Kohlenhydrate pro Stunde`

  // Run the real coach adapt (or clear it when the same option is tapped off).
  const runAdapt = async (kind: Exclude<Adapt, 'none'>) => {
    if (adapt === kind) { setAdapt('none'); setResult(null); setError(null); return }
    setAdapt(kind); setError(null)
    if (kind === 'rest') { setResult(null); return } // rest is deterministic
    if (!onAdapt) return
    setBusy(kind)
    try {
      const r = await onAdapt(kind)
      setResult(r)
      if (!r) setError('Heute gibt es keinen Plan zum Anpassen.')
    } catch {
      setError('Der Coach konnte gerade nicht neu planen.')
      setAdapt('none')
    } finally {
      setBusy('none')
    }
  }

  const header = (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
          <span style={{ minWidth: 0, fontSize: editorial ? 12.5 : 17, fontWeight: editorial ? 600 : 700, letterSpacing: editorial ? 0.5 : -0.4, color: editorial ? T.mid : T.ink, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {editorial ? day.dateLabel : isToday ? 'Heutige Einheit' : day.weekday}
          </span>
          {/* The explanation, where the doubt is. Only on TODAY: the reasoning
              is about this morning's signals, and offering it beside Thursday
              would promise an answer nothing computed. */}
          {isToday && <W3WhyButton />}
        </div>
        {!editorial && <span style={{ fontSize: 10.5, fontWeight: 600, color: T.quiet, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{day.dateLabel}</span>}
      </div>
      {(!editorial || !isToday) && <div style={{ flex: 'none', display: 'flex', gap: 6, alignItems: 'center', padding: '6px 11px', borderRadius: 100, background: chipBg }}>
        <StIcon size={11} color={chipHue} />
        <span style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', color: chipHue }}>{st.label}</span>
      </div>}
    </div>
  )

  // A future day with no prescribed session IS a rest day (the plan schedules
  // rest; the coach fills training days a week ahead and re-plans each morning).
  // A rest day is a day TYPE; `status` is a position marker and 'today' always
  // wins over it (W3TodayPage: `isToday ? 'today' : …`). So a rest day that
  // happens to be today never carried status 'rest', fell through to the
  // session branch, and drew interval beams under the heading "Ruhetag".
  // `day.rest` states the type independently of where the day sits.
  const restDay = isRest || day.rest === true || day.status === 'rest' || (isFuture && !day.title)
  if (restDay && !isPast) {
    return (
      <motion.div className={editorialClass} initial={reduce ? false : { opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.28, ease: EASE }}
        style={{ ...editorialTokens, display: 'flex', flexDirection: 'column', gap: editorial ? 20 : 14 }}>
        {!editorial && <Rule />}
        {header}
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <div style={{ width: 40, height: 40, flex: 'none', borderRadius: 13, background: `${T.rem}1F`, display: 'grid', placeItems: 'center' }}><Moon size={19} color={T.rem} /></div>
          <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3 }}>
            <span style={{ fontSize: 20, fontWeight: 700, letterSpacing: -0.4, color: T.ink }}>Ruhetag</span>
            <span style={{ fontSize: 11.5, fontWeight: 600, lineHeight: 1.35, color: T.mid }}>
              {isToday
                ? 'Lass die Belastung von heute setzen — 0 TSS. Der nächste Block trifft dafür härter.'
                : 'Hier ist Erholung eingeplant — 0 TSS. Der Coach füllt Trainingstage eine Woche im Voraus und rechnet jeden Morgen neu.'}
            </span>
          </div>
        </div>
        {/* A rest day is still a DAY, and "what is the weather doing" is a
            question about the day, not about the session — so this stays.
            COMPACT, though: the full frame recommends the best 2-hour window to
            ride and stamps a verdict on it, which is the app overruling its own
            Ruhetag two lines above. Conditions, not a recommendation. */}
        <Rule />
        <WeatherLine w={weather} isToday={isToday} dateLabel={day.dateLabel} compact />
        {isToday && (
          <>
            <SessionLink editorial={editorial} label="Einheit & Wirkung ansehen" onOpen={() => navigate('/e/w3-session')} />
            {showAdapt
              ? <AdaptRow adapt={adapt} busy={busy} onPick={runAdapt} />
              : <AdjustButton editorial={editorial} onOpen={() => setShowAdapt(true)} />}
          </>
        )}
      </motion.div>
    )
  }

  return (
    <motion.div className={editorialClass} key={adapt} initial={reduce ? false : { opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.28, ease: EASE }}
      style={{ ...editorialTokens, display: 'flex', flexDirection: 'column', gap: 12, opacity: day.status === 'missed' ? 0.75 : 1 }}>
      {!editorial && <Rule />}
      {!editorial && header}

      {editorial ? <TrainingInstrument
        title={result?.title ?? day.title ?? 'Noch nicht festgelegt'}
        blocks={day.title && !profileStale ? session.blocks : []}
        duration={day.title && !profileStale ? session.dur : null}
        target={day.title && curT ? `${curT} W` : null}
        tss={day.title ? curTss || null : null}
        ftpPct={curFtp ? `${curFtp}%` : null}
        ftpTag={session.ftpTag}
        accessory={isToday ? <W3WhyButton /> : undefined}
      /> : <>
        <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: -0.6, lineHeight: 1.1, color: day.title ? T.ink : T.mid }}>
          {day.title ?? (isFuture ? 'Noch nicht festgelegt' : 'Ruhetag')}
        </div>
        {(day.title != null && (curTss > 0 || curT > 0)) && <SessionNumbers stats={stats} />}
      </>}

      {isToday && editorial && <SessionLink editorial label="Einheit & Wirkung ansehen" onOpen={() => navigate('/e/w3-session')} />}

      {/* the coach's own explanation of the re-plan (real AI rationale) */}
      {isToday && adapted && (result || error) && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', padding: '10px 12px', borderRadius: 12, background: T.acidDim }}>
          <Sparkles size={13} color={T.acid} style={{ flex: 'none', marginTop: 1 }} />
          <span style={{ flex: 1, minWidth: 0, fontSize: 11.5, fontWeight: 600, lineHeight: 1.4, color: error ? T.warn : T.ink }}>
            {error ?? result?.rationale}
            {result?.railsDowngraded && <span style={{ color: T.warn }}> · Sicherheitshalber abgemildert.</span>}
          </span>
        </div>
      )}

      {isToday && !editorial && (
        <>
          {/* Guarded like the future-day branch below: with no prescribed
              session there are no bars to draw, and an empty chart frame is
              better than the invented profile this used to fall back to. */}
          {session.blocks.length > 0 && <IntervalBars blocks={session.blocks} ftpTag={session.ftpTag} h={104} editorial={editorial} />}
          <span style={{ fontSize: 11.5, fontWeight: 500, lineHeight: 1.4, color: T.mid }}>{workDesc}</span>
        </>
      )}

      {isToday && editorial && <details className="w3-training-support"><summary>Durchführung & Verpflegung</summary><p>{day.dateLabel}</p><p>{workDesc}</p></details>}

      {isFuture && (
        <>
          {session.blocks.length > 0 && <IntervalBars blocks={session.blocks} ftpTag={session.ftpTag} h={104} editorial={editorial} />}
          <span style={{ fontSize: 11.5, fontWeight: 500, lineHeight: 1.4, color: T.quiet }}>
            Eine Woche im Voraus geplant — festgezurrt wird am Morgen, sobald deine Nachtwerte da sind.
          </span>
        </>
      )}

      {editorial ? <details className="w3-training-support"><summary>Strecken & Wetter</summary>
        <W3DayRoute caption="Draußen" targetTss={result?.tss ?? day.planned} durationMinutes={durMinutes} indoor={false} onOpen={() => navigate('/e/w3-rides')} />
        <W3DayRoute caption="Drinnen" targetTss={result?.tss ?? day.planned} durationMinutes={durMinutes} indoor onOpen={() => navigate('/e/w3-rides')} />
        <WeatherLine w={weather} isToday={isToday} dateLabel={day.dateLabel} />
      </details> : <>
      {(isToday || isFuture) && day.status !== 'rest' && (
        <>
          {/* BOTH answers, not the one the app guessed. Whether this session
              happens on the road or on the trainer is the rider's call and it
              is usually made at the door — so the card stops inferring it from
              the adaptation and shows the real recommendation for each, side
              by side. They are different queries against the same session:
              outdoors ranks their own roads, indoors ranks their trainer
              routes. Each renders nothing when it has nothing worth naming,
              so a rider with no trainer history simply sees the one. */}
          <W3DayRoute
            caption="Draußen"
            targetTss={result?.tss ?? day.planned}
            durationMinutes={durMinutes}
            indoor={false}
            onOpen={() => navigate('/e/w3-rides')} />
          <W3DayRoute
            caption="Drinnen"
            targetTss={result?.tss ?? day.planned}
            durationMinutes={durMinutes}
            indoor
            onOpen={() => navigate('/e/w3-rides')} />
        </>
      )}

      </>}

      {isPast && day.status !== 'rest' && (
        day.status === 'missed' ? (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <Minus size={15} color={T.warn} style={{ flex: 'none' }} />
            <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, fontWeight: 600, color: T.warn }}>Ausgelassen — keine Fahrt für diese Einheit.</span>
          </div>
        ) : (
          <PlannedVsDone day={day} reduce={reduce} />
        )
      )}

      {/* ── Weather: the selected DATE's line. Real numbers for today only. ── */}
      {!isPast && !editorial && (
        <>
          <Rule />
          <WeatherLine w={weather} isToday={isToday} dateLabel={day.dateLabel} />
        </>
      )}

      {isToday && (
        <>
          {/* Only when the session has a computable earn — a rest day or an
              unset session promises no RideCoin rather than a vague sentence. */}
          {session.earn && (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <Zap size={14} color={T.acid} style={{ flex: 'none' }} />
              <span style={{ flex: 1, minWidth: 0, fontSize: 11.5, color: T.mid, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{session.earn}</span>
            </div>
          )}
          {!editorial && <SessionLink editorial={editorial} label="Einheit & Wirkung ansehen" onOpen={() => navigate('/e/w3-session')} />}
          {showAdapt
            ? <AdaptRow adapt={adapt} busy={busy} onPick={runAdapt} />
            : <AdjustButton editorial={editorial} onOpen={() => setShowAdapt(true)} />}
        </>
      )}

      {/* ── THE WAY IN IS NOT TODAY-ONLY ──────────────────────────────────
           This button lived inside the `isToday` branch above, so selecting
           any other day in the strip removed the only route from Today into a
           training's detail — and nothing on screen said that tapping the
           lit day tile would bring it back. A planned day HAS a session with
           real intervals; it is reachable in the full plan, so the day that
           owns one keeps a way into it. Past days keep planned-vs-done, which
           is their detail. ── */}
      {isFuture && day.title != null && (
        <SessionLink editorial={editorial} label="Einheit & Wirkung ansehen" onOpen={() => navigate('/e/w3-session')} />
      )}
    </motion.div>
  )
}

/** The way into a training's own screen. One element, because the today CTA
 *  and the planned-day CTA are the same promise and must not drift apart. */
function SessionLink({ label, onOpen, editorial = false }: { label: string; onOpen: () => void; editorial?: boolean }) {
  return (
    <button className={editorial ? 'w3-today-training-open' : undefined} onClick={onOpen}
      style={{ height: 52, width: '100%', borderRadius: editorial ? 18 : 100, background: T.acid, border: 0, cursor: 'pointer', fontFamily: FONT, display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 7px 0 20px' }}>
      <span style={{ fontSize: editorial ? 14 : 16, fontWeight: editorial ? 600 : 700, letterSpacing: -0.2, color: T.bg }}>{label}</span>
      <div style={{ width: 38, height: 38, flex: 'none', borderRadius: 100, background: T.bg, display: 'grid', placeItems: 'center' }}><ArrowRight size={18} color={T.acid} /></div>
    </button>
  )
}

function AdjustButton({ onOpen, editorial = false }: { onOpen: () => void; editorial?: boolean }) {
  return (
    <button onClick={onOpen}
      style={{ display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'center', height: editorial ? 44 : 42, width: '100%', borderRadius: editorial ? 16 : 100, background: editorial ? 'transparent' : T.surface2, border: 0, cursor: 'pointer', fontFamily: FONT }}>
      <SlidersHorizontal size={14} color={T.mid} />
      <span style={{ fontSize: 12.5, fontWeight: editorial ? 600 : 700, letterSpacing: 0.3, color: T.mid }}>Anpassen</span>
      <ChevronDown size={14} color={T.quiet} />
    </button>
  )
}

/** THE card: week selector + selected day's training + selected day's weather.
 *  Controlled — `selected` lives in W3TodayView, so the whole card is one
 *  pure function of the day you tapped. */
export function WeekTrainingCard({ days, selected, onSelect, blockLabel, doneChip, loadLabel, day, session, weather, onAdapt, embedded = false, detailsOnly = false }: {
  days: W3DayFull[]; selected: number; onSelect: (i: number) => void; embedded?: boolean; detailsOnly?: boolean
  blockLabel: string; doneChip: string | null; loadLabel: string
  day: W3DayFull; session: TodaySession; weather: W3Weather; onAdapt?: OnAdapt
}) {
  const reduce = useReducedMotion()
  // Computed here, not passed in: the seven tiles already carry every number,
  // and a prop for their own sum is a second source of truth for one figure.
  // Ridden counts where it exists and planned stands in where it does not, so
  // the left-hand number is "what the week has actually cost so far".
  const doneTss = Math.round(days.reduce((s, d) => s + (d.actual || 0), 0))
  const planTss = Math.round(days.reduce((s, d) => s + Math.max(d.actual, d.planned ?? 0), 0))
  const weekTss = planTss > 0 ? `${doneTss} VON ${planTss} TSS` : loadLabel
  if (detailsOnly) return <DayTraining key={day.dateLabel} day={day} session={session} weather={weather} onAdapt={onAdapt} />
  // band(26), like every other band on Today. This one sat at 20 and was the
  // only section whose bottom gap did not match its neighbours — the eye reads
  // that inconsistency as a mistake long before it can name it.
  return (
    <div style={embedded ? { display: 'flex', flexDirection: 'column' } : band(26)}>
      <div style={{ ...card(), ...(embedded ? { background: 'transparent', border: 0, boxShadow: 'none', padding: 0 } : { padding: 18 }), gap: 16 }}>

        {/* header — the week, its block, and how much of it is done */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
          <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3 }}>
            {!embedded && <span style={{ fontSize: 22, fontWeight: 700, letterSpacing: -0.6, color: T.ink }}>Deine Woche</span>}
            <span style={{ fontSize: 11, fontWeight: 600, color: T.quiet, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{blockLabel}</span>
          </div>
          <div style={{ flex: 'none', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 5 }}>
            {doneChip && <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: 0.6, color: T.mid, padding: '5px 10px', borderRadius: 100, background: T.surface2 }}>{doneChip}</span>}
            {/* "486 von 620 TSS" — the week as one figure, which is the thing
                the seven tiles below add up to and the only way to see at a
                glance whether the week is on course. */}
            <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: 0.8, color: T.quiet, fontVariantNumeric: 'tabular-nums' }}>
              {weekTss}
            </span>
          </div>
        </div>

        {/* the 7 day cells — letter over number over a load tick */}
        <div style={{ display: 'flex', gap: 4 }}>
          {days.map((d, i) => {
            const isToday = d.status === 'today'
            const active = i === selected
            const lit = beamSteps(Math.max(d.actual, d.planned ?? 0))
            // Brighter than the old tick needed to be. A continuous bar was read
            // by its height and could afford to be faint; four steps are read by
            // COUNTING them, and a step at 30% white on a #161616 card cannot be
            // counted at arm's length.
            const hue = isToday ? T.acid
              : d.status === 'missed' ? T.warn
                : d.status === 'over' ? T.cool
                  : active ? T.ink
                    : d.status === 'hit' ? T.d4 : T.d3
            return (
              <button key={i} onClick={() => onSelect(i)} aria-pressed={active} aria-label={`${d.dateLabel}, ${STATUS[d.status].label}, Intensität ${lit} von ${BEAM_STEPS}`}
                style={{
                  // A TILE, not a bare column. Pen `Fd638` gives every day its
                  // own surface, and it earns its keep: seven equal tiles read
                  // as one strip of the same kind of thing, where seven columns
                  // of floating marks read as a chart with no frame. Today's
                  // tile is the acid one — the only lit object in the row.
                  flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5,
                  padding: '9px 0 8px', borderRadius: 14, cursor: 'pointer', fontFamily: FONT,
                  background: isToday ? T.acidDim : active ? T.heroChip : T.d1,
                  border: `1px solid ${isToday ? `${T.acid}59` : 'transparent'}`,
                }}>
                <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: 0.6, color: isToday ? T.acid : active ? T.mid : T.quiet }}>{d.letter}</span>
                <span style={{ fontSize: 15, fontWeight: 700, letterSpacing: -0.4, fontVariantNumeric: 'tabular-nums', color: isToday ? T.acid : active ? T.ink : T.mid }}>{d.num}</span>
                <div aria-hidden style={BEAM_COL}>
                  {Array.from({ length: BEAM_STEPS }, (_, s) => (
                    <motion.div key={s}
                      initial={reduce ? false : { scaleX: 0.3 }}
                      animate={{ scaleX: 1 }}
                      transition={grow(i * 0.03 + s * 0.04)}
                      style={{
                        height: BEAM_SEG, borderRadius: 1.5,
                        // An unlit step is a SLOT, not a bar: visible enough to
                        // be counted against the card, far enough below every
                        // lit hue that it can never be mistaken for load that
                        // was actually ridden. `surface2` was neither — at
                        // #202020 on a #161616 card it simply disappeared, and
                        // a beam you cannot count the empty half of is just the
                        // old variable-length bar with steps in it.
                        background: s < lit ? hue : T.d1,
                      }} />
                  ))}
                </div>
              </button>
            )
          })}
        </div>

        <DayTraining key={day.dateLabel} day={day} session={session} weather={weather} onAdapt={onAdapt} />
      </div>
    </div>
  )
}

/** Navigation, not week content: the season goal this week feeds, and the whole
 *  plan. Their own bands BELOW the week card. */
export function WeekNavCards({ goal, planWeeks, onGoal, onPlan }: { goal: W3WeekGoal | null; planWeeks: string; onGoal?: () => void; onPlan?: () => void }) {
  return (
    <div style={{ ...band(26), gap: 10 }}>
      {goal && (
        <button onClick={onGoal} style={{ display: 'flex', gap: 14, alignItems: 'center', padding: 16, borderRadius: 20, background: T.surface, border: 0, cursor: 'pointer', fontFamily: FONT, textAlign: 'left' }}>
          <div style={{ width: 40, height: 40, borderRadius: 12, background: T.acidDim, display: 'grid', placeItems: 'center', flex: 'none' }}><Flag size={18} color={T.acid} /></div>
          <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: 1, color: T.quiet }}>SAISONZIEL</span>
            <span style={{ fontSize: 15, fontWeight: 700, color: T.ink, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{goal.name}</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2, flex: 'none' }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: T.acid }}>{goal.right}</span>
            <span style={{ fontSize: 10.5, fontWeight: 600, color: T.quiet }}>{goal.sub}</span>
          </div>
        </button>
      )}
      <button onClick={onPlan} style={{ display: 'flex', gap: 14, alignItems: 'center', padding: 16, borderRadius: 20, background: T.surface, border: 0, cursor: 'pointer', fontFamily: FONT, textAlign: 'left' }}>
        <div style={{ width: 40, height: 40, borderRadius: 12, background: T.surface2, display: 'grid', placeItems: 'center', flex: 'none' }}><Calendar size={18} color={T.mid} /></div>
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
          <span style={{ fontSize: 15, fontWeight: 700, color: T.ink, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>Ganzer Plan{planWeeks ? ` · ${planWeeks}` : ''}</span>
          <span style={{ fontSize: 11.5, fontWeight: 600, color: T.quiet, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>Ziel, Phasen und Wochen anpassen</span>
        </div>
        <ChevronRight size={18} color={T.mid} style={{ flex: 'none' }} />
      </button>
    </div>
  )
}

// The 6-week fitness/fatigue MirrorChart used to live here. It was replaced
// by `W3TodayStatus`, which draws the real 90-day CTL/ATL series on a
// zero-based axis with real dates — the mirror normalised each series to
// its own max, so two different quantities shared one invented scale and
// neither could be read off the chart.

type AdaptOpt = { key: Exclude<Adapt, 'none'>; label: string; sub: string; icon: typeof Zap }
// Intensity — persists via the modifier's easier/harder cascade (rails watch it).
const INTENSITY_OPTS: AdaptOpt[] = [
  { key: 'easier', label: 'Leichter', sub: 'nimm raus', icon: TrendingDown },
  { key: 'harder', label: 'Härter', sub: 'gib Gas', icon: TrendingUp },
]
// Exchange — swap the session for a different real modification the backend
// supports. There is no swap endpoint, so these are the honest levers: shorten
// to 45 min, move indoors (watts unchanged), or take the day off. Rest is the
// only deterministic one (the modifier has no rest type); the rest persist.
const EXCHANGE_OPTS: AdaptOpt[] = [
  { key: 'shorter', label: 'Kürzer', sub: '45 min', icon: Clock },
  { key: 'indoor', label: 'Drinnen', sub: 'Rolle', icon: Home },
  { key: 'rest', label: 'Ruhetag', sub: '0 TSS', icon: Moon },
]

function AdaptGroup({ label, opts, adapt, busy, onPick }: { label: string; opts: AdaptOpt[]; adapt: Adapt; busy: Adapt; onPick: (k: Exclude<Adapt, 'none'>) => void }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
      <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', color: T.quiet }}>{label}</span>
      <div style={{ display: 'flex', gap: 7 }}>
        {opts.map((o) => {
          const on = adapt === o.key
          const loading = busy === o.key
          const Ic = o.icon
          return (
            <button key={o.key} onClick={() => onPick(o.key)} disabled={busy !== 'none'} aria-pressed={on}
              style={{
                flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3, alignItems: 'center', padding: '11px 0', cursor: busy !== 'none' ? 'default' : 'pointer',
                borderRadius: 14, fontFamily: FONT, background: on ? T.acidDim : T.surface2, border: `1px solid ${on ? T.acid : 'transparent'}`, opacity: busy !== 'none' && !loading ? 0.5 : 1,
              }}>
              <Ic size={15} color={on ? T.acid : T.mid} />
              <span style={{ fontSize: 12, fontWeight: 700, color: on ? T.acid : T.ink }}>{o.label}</span>
              <span style={{ fontSize: 10, fontWeight: 600, color: on ? T.acid : T.quiet }}>{loading ? 'speichert…' : o.sub}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

function AdaptRow({ adapt, busy, onPick }: { adapt: Adapt; busy: Adapt; onPick: (k: Exclude<Adapt, 'none'>) => void }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <AdaptGroup label="Keine Lust? Der Coach plant neu" opts={INTENSITY_OPTS} adapt={adapt} busy={busy} onPick={onPick} />
      <AdaptGroup label="Einheit tauschen" opts={EXCHANGE_OPTS} adapt={adapt} busy={busy} onPick={onPick} />
    </div>
  )
}

/**
 * THE WEATHER, ON ITS OWN, for a rider with no plan.
 *
 * The forecast normally lives inside the week card, under the day the rider
 * selected — it is context for a prescribed session. Without a plan there is
 * no session to give context to, and the weather stops being a footnote and
 * becomes the one piece of genuinely actionable information Today still has:
 * it is the only thing on the screen that can tell an unplanned rider when to
 * go out. So it gets its own card and its own heading.
 *
 * Same `WeatherLine` as the week card renders, deliberately — one forecast in
 * one handwriting, including its honest empty state when there is no GPS ride
 * to locate the rider by.
 */
export function TodayWeatherCard({ weather }: { weather: W3Weather }) {
  return (
    <div style={band(26)}>
      <div style={{ ...card(), padding: 18, gap: 14 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          <span style={{ fontSize: 22, fontWeight: 700, letterSpacing: -0.6, color: T.ink }}>Wann du rausfährst</span>
          <span style={{ fontSize: 11, fontWeight: 600, color: T.quiet }}>Heute, Stunde für Stunde</span>
        </div>
        <WeatherLine w={weather} isToday dateLabel="heute" />
      </div>
    </div>
  )
}
