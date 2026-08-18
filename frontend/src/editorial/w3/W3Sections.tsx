import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, useReducedMotion } from 'motion/react'
import { CloudSun, Check, Minus, TrendingUp, TrendingDown, Moon, Zap, ArrowRight, Sparkles, SlidersHorizontal, ChevronDown, Clock, Home, Flag, Calendar, ChevronRight, Timer, Gauge, Percent, Wind, Droplets, Thermometer, type LucideIcon } from 'lucide-react'
import { T, FONT, EASE, grow, Kicker, card, band, DASH } from './w3tokens'

// ────────────────────────────────────────────────────────────────────────
// "Deine Woche" — ONE card: the week's day selector, the selected day's
// training, and the selected day's weather. Selecting a day drives all three.
// ────────────────────────────────────────────────────────────────────────
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
        {metrics.map((m) => {
          const Ic = m.icon
          const has = m.v !== DASH
          return (
            <div key={m.l} style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 5, minWidth: 0 }}>
                <Ic size={12} color={T.mid} style={{ flex: 'none' }} />
                <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, fontWeight: 700, letterSpacing: -0.2, fontVariantNumeric: 'tabular-nums', color: has ? T.ink : T.quiet, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.v}</span>
              </div>
              <span style={{ fontSize: 8.5, fontWeight: 700, letterSpacing: 0.8, color: T.quiet, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.l}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function WeatherLine({ w, isToday, dateLabel }: { w: W3Weather; isToday: boolean; dateLabel: string }) {
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

export function IntervalBars({ blocks, ftpTag, h = 96 }: { blocks: W3Block[]; ftpTag: string; h?: number }) {
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
            style={{ flex: b.work ? '0 1 34px' : '1 1 18px', minWidth: 0, height: bh, borderRadius: '3px 3px 0 0', cursor: 'pointer',
              background: b.work ? `linear-gradient(180deg, ${T.acid}, ${T.acidDeep})` : '#FFFFFF2B', outline: on ? `1px solid ${T.ink}` : 'none' }} />
        )
      })}
      <div style={{ position: 'absolute', top: Math.round(h * 0.19), left: 0, right: 0, height: 1, background: '#FFFFFF66' }} />
      <span style={{ position: 'absolute', top: 2, left: 0, fontSize: 9, fontWeight: 600, letterSpacing: 1, color: T.mid, maxWidth: '100%', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {hov != null ? blocks[hov].label : ftpTag}
      </span>
    </div>
  )
}

export type Adapt = 'none' | 'easier' | 'harder' | 'shorter' | 'indoor' | 'rest'

/** A real coach re-plan result. For the intensity/exchange options `onAdapt`
 *  PERSISTS the change (POST /workouts/today/modify) and the numbers/`title`
 *  come from the modifier + the refreshed week. Rest is deterministic (0 TSS).
 *  Returns null when the day has no plan to adapt. */
export interface AdaptResult { targetW: string; tss: number | null; ftpPct: string; rationale: string; railsDowngraded: boolean; title?: string | null }
export type OnAdapt = (kind: Exclude<Adapt, 'none'>) => Promise<AdaptResult | null>

interface DayStat { icon: LucideIcon; v: string; l: string; hue?: string }

/** One supporting number of the selected day's prescription, as its own mini
 *  card: icon chip left, number over kicker right.
 *
 *  Deliberately quiet — the session title and the CTA keep the card's only acid
 *  voices. `hue` is passed ONLY when the coach has just re-planned that number,
 *  and a missing value ("—") stays T.quiet and keeps the chip grey, so an
 *  adapted-but-unknown number can never look like a real one.
 *
 *  Width (390 viewport): 390 − 40 band − 36 card padding = 314 usable; two
 *  columns at gap 8 → 153 per card, minus 22 padding = 131 for chip (24) + gap
 *  (9) + text (98). "285 W" at 13.5/700 Inter Tight is ~37, "DER FTP" ~42 — both
 *  clear, and every child carries minWidth: 0 so nothing can push the row wide.
 *
 *  Sizing is deliberately SMALL (13.5 px numbers, 24 px chips): these are the
 *  session's supporting numbers, and at 17 px they out-shouted the interval
 *  profile — which is the thing you actually read to know what the ride is. The
 *  ~17 px of row height this gives back goes straight into IntervalBars. */
function StatCard({ icon: Ic, v, l, hue, span }: DayStat & { span?: boolean }) {
  const has = v !== DASH
  const on = has && hue != null
  return (
    <div style={{ gridColumn: span ? '1 / -1' : undefined, minWidth: 0, display: 'flex', alignItems: 'center', gap: 9, padding: '9px 11px', borderRadius: 14, background: T.surface2 }}>
      <div style={{ width: 24, height: 24, flex: 'none', borderRadius: 8, background: on ? T.acidDim : '#FFFFFF0F', display: 'grid', placeItems: 'center' }}>
        <Ic size={13} color={on ? T.acid : T.mid} />
      </div>
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
        <span style={{ fontSize: 13.5, fontWeight: 700, letterSpacing: -0.2, fontVariantNumeric: 'tabular-nums', color: has ? (hue ?? T.ink) : T.quiet, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{v}</span>
        <Kicker>{l}</Kicker>
      </div>
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
      {/* What you actually rode — real duration / avg power / avg HR. */}
      {(day.actualDurMin != null || day.actualW != null || day.actualHr != null) && (
        <div style={{ display: 'flex', gap: 8, paddingTop: 12, borderTop: `1px solid ${T.rule}` }}>
          {[
            ['DAUER', day.actualDurMin != null ? `${Math.floor(day.actualDurMin / 60)}:${String(Math.round(day.actualDurMin % 60)).padStart(2, '0')}` : '—'],
            ['Ø LEISTUNG', day.actualW != null ? `${Math.round(day.actualW)} W` : '—'],
            ['Ø HF', day.actualHr != null ? `${Math.round(day.actualHr)}` : '—'],
          ].map(([l, v]) => (
            <div key={l} style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3, padding: '10px 12px', borderRadius: 14, background: T.surface2 }}>
              <span style={{ fontSize: 15, fontWeight: 800, letterSpacing: -0.4, color: v === '—' ? T.quiet : T.ink }}>{v}</span>
              <span style={{ fontSize: 8, fontWeight: 700, letterSpacing: 0.8, color: T.quiet }}>{l}</span>
            </div>
          ))}
        </div>
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
function DayTraining({ day, session, weather, onAdapt }: { day: W3DayFull; session: TodaySession; weather: W3Weather; onAdapt?: OnAdapt }) {
  const [adapt, setAdapt] = useState<Adapt>('none')
  const [busy, setBusy] = useState<Adapt>('none')
  const [result, setResult] = useState<AdaptResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showAdapt, setShowAdapt] = useState(false)
  const navigate = useNavigate()
  const reduce = useReducedMotion()
  const isToday = day.status === 'today'
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
  const tw = day.targetW && day.targetW !== '—' ? day.targetW : 'im Zielbereich'
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
        <span style={{ fontSize: 17, fontWeight: 700, letterSpacing: -0.4, color: T.ink, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {isToday ? 'Heutige Einheit' : day.weekday}
        </span>
        <span style={{ fontSize: 10.5, fontWeight: 600, color: T.quiet, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{day.dateLabel}</span>
      </div>
      <div style={{ flex: 'none', display: 'flex', gap: 6, alignItems: 'center', padding: '6px 11px', borderRadius: 100, background: chipBg }}>
        <StIcon size={11} color={chipHue} />
        <span style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', color: chipHue }}>{st.label}</span>
      </div>
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
      <motion.div initial={reduce ? false : { opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.28, ease: EASE }}
        style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <Rule />
        {header}
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <div style={{ width: 40, height: 40, flex: 'none', borderRadius: 13, background: '#00E5FF1F', display: 'grid', placeItems: 'center' }}><Moon size={19} color="#00E5FF" /></div>
          <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3 }}>
            <span style={{ fontSize: 20, fontWeight: 700, letterSpacing: -0.4, color: T.ink }}>Ruhetag</span>
            <span style={{ fontSize: 11.5, fontWeight: 600, lineHeight: 1.35, color: T.mid }}>
              {isToday
                ? 'Lass die Belastung von heute setzen — 0 TSS. Der nächste Block trifft dafür härter.'
                : 'Hier ist Erholung eingeplant — 0 TSS. Der Coach füllt Trainingstage eine Woche im Voraus und rechnet jeden Morgen neu.'}
            </span>
          </div>
        </div>
        {isToday && (showAdapt
          ? <AdaptRow adapt={adapt} busy={busy} onPick={runAdapt} />
          : <AdjustButton onOpen={() => setShowAdapt(true)} />)}
      </motion.div>
    )
  }

  return (
    <motion.div key={adapt} initial={reduce ? false : { opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.28, ease: EASE }}
      style={{ display: 'flex', flexDirection: 'column', gap: 12, opacity: day.status === 'missed' ? 0.75 : 1 }}>
      <Rule />
      {header}

      <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: -0.6, lineHeight: 1.1, color: day.title ? T.ink : T.mid }}>
        {day.title ?? (isFuture ? 'Noch nicht festgelegt' : 'Ruhetag')}
      </div>

      {/* Stats only when there's a real prescription (title + a number). A
          future day with no plan yet hides the empty dash row. */}
      {(day.title != null && (curTss > 0 || curT > 0)) && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8 }}>
          {stats.map((s, i) => (
            <StatCard key={s.l} {...s} span={stats.length % 2 === 1 && i === stats.length - 1} />
          ))}
        </div>
      )}

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

      {isToday && (
        <>
          {/* Guarded like the future-day branch below: with no prescribed
              session there are no bars to draw, and an empty chart frame is
              better than the invented profile this used to fall back to. */}
          {session.blocks.length > 0 && <IntervalBars blocks={session.blocks} ftpTag={session.ftpTag} h={104} />}
          <span style={{ fontSize: 11.5, fontWeight: 500, lineHeight: 1.4, color: T.mid }}>{workDesc}</span>
        </>
      )}

      {isFuture && (
        <>
          {session.blocks.length > 0 && <IntervalBars blocks={session.blocks} ftpTag={session.ftpTag} h={104} />}
          <span style={{ fontSize: 11.5, fontWeight: 500, lineHeight: 1.4, color: T.quiet }}>
            Eine Woche im Voraus geplant — festgezurrt wird am Morgen, sobald deine Nachtwerte da sind.
          </span>
        </>
      )}

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
      {!isPast && (
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
          <button onClick={() => navigate('/e/w3-session')}
            style={{ height: 52, width: '100%', borderRadius: 100, background: T.acid, border: 0, cursor: 'pointer', fontFamily: FONT, display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 7px 0 20px' }}>
            <span style={{ fontSize: 16, fontWeight: 700, letterSpacing: -0.2, color: T.bg }}>Training ansehen</span>
            <div style={{ width: 38, height: 38, flex: 'none', borderRadius: 100, background: T.bg, display: 'grid', placeItems: 'center' }}><ArrowRight size={18} color={T.acid} /></div>
          </button>
          {showAdapt
            ? <AdaptRow adapt={adapt} busy={busy} onPick={runAdapt} />
            : <AdjustButton onOpen={() => setShowAdapt(true)} />}
        </>
      )}
    </motion.div>
  )
}

function AdjustButton({ onOpen }: { onOpen: () => void }) {
  return (
    <button onClick={onOpen}
      style={{ display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'center', height: 42, width: '100%', borderRadius: 100, background: T.surface2, border: 0, cursor: 'pointer', fontFamily: FONT }}>
      <SlidersHorizontal size={14} color={T.mid} />
      <span style={{ fontSize: 12.5, fontWeight: 700, letterSpacing: 0.3, color: T.mid }}>Anpassen</span>
      <ChevronDown size={14} color={T.quiet} />
    </button>
  )
}

/** THE card: week selector + selected day's training + selected day's weather.
 *  Controlled — `selected` lives in W3TodayView, so the whole card is one
 *  pure function of the day you tapped. */
export function WeekTrainingCard({ days, selected, onSelect, blockLabel, doneChip, loadLabel, day, session, weather, onAdapt }: {
  days: W3DayFull[]; selected: number; onSelect: (i: number) => void
  blockLabel: string; doneChip: string | null; loadLabel: string
  day: W3DayFull; session: TodaySession; weather: W3Weather; onAdapt?: OnAdapt
}) {
  const reduce = useReducedMotion()
  const max = Math.max(1, ...days.map((d) => Math.max(d.actual, d.planned ?? 0)))
  // band(26), like every other band on Today. This one sat at 20 and was the
  // only section whose bottom gap did not match its neighbours — the eye reads
  // that inconsistency as a mistake long before it can name it.
  return (
    <div style={band(26)}>
      <div style={{ ...card(), padding: 18, gap: 14 }}>

        {/* header — the week, its block, and how much of it is done */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
          <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3 }}>
            <span style={{ fontSize: 22, fontWeight: 700, letterSpacing: -0.6, color: T.ink }}>Deine Woche</span>
            <span style={{ fontSize: 11, fontWeight: 600, color: T.quiet, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{blockLabel}</span>
          </div>
          <div style={{ flex: 'none', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 5 }}>
            {doneChip && <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: 0.6, color: T.mid, padding: '5px 10px', borderRadius: 100, background: T.surface2 }}>{doneChip}</span>}
            <span style={{ fontSize: 10, fontWeight: 600, color: T.quiet }}>{loadLabel}</span>
          </div>
        </div>

        {/* the 7 day cells — letter over number over a load tick */}
        <div style={{ display: 'flex', gap: 4 }}>
          {days.map((d, i) => {
            const isToday = d.status === 'today'
            const active = i === selected
            const val = Math.max(d.actual, d.planned ?? 0)
            const tick = val <= 0 ? 2 : Math.max(3, Math.round((val / max) * 14))
            const hue = isToday ? T.acid
              : d.status === 'missed' ? T.warn
                : d.status === 'over' ? T.cool
                  : active ? T.d4
                    : d.status === 'hit' ? T.d3 : T.d2
            return (
              <button key={i} onClick={() => onSelect(i)} aria-pressed={active} aria-label={`${d.dateLabel}, ${STATUS[d.status].label}`}
                style={{
                  flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5,
                  padding: '8px 0 7px', borderRadius: 13, cursor: 'pointer', fontFamily: FONT,
                  background: active ? (isToday ? T.acidDim : T.surface2) : 'transparent',
                  border: `1px solid ${active && isToday ? `${T.acid}59` : 'transparent'}`,
                }}>
                <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: 0.6, color: isToday ? T.acid : active ? T.mid : T.quiet }}>{d.letter}</span>
                <span style={{ fontSize: 15, fontWeight: 700, letterSpacing: -0.4, fontVariantNumeric: 'tabular-nums', color: isToday ? T.acid : active ? T.ink : T.mid }}>{d.num}</span>
                <div style={{ width: '100%', height: 14, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
                  <motion.div initial={reduce ? false : { height: 0 }} animate={{ height: tick }} transition={grow(i * 0.03)}
                    style={{ width: '58%', height: tick, borderRadius: 2, background: hue }} />
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
