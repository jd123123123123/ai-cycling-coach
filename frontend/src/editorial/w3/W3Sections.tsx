import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, useReducedMotion } from 'motion/react'
import { CloudSun, Check, Minus, TrendingUp, TrendingDown, Moon, Zap, ArrowRight, Sparkles, SlidersHorizontal, ChevronDown, Clock, Home, Flag, Calendar, ChevronRight, Timer, Gauge, Percent, type LucideIcon } from 'lucide-react'
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
}

export const STATUS: Record<DayStatus, { label: string; hue: string; icon: typeof Check }> = {
  today: { label: 'Heute', hue: T.acid, icon: TrendingUp },
  hit: { label: 'Nailed it', hue: T.acid, icon: Check },
  missed: { label: 'Missed', hue: T.warn, icon: Minus },
  over: { label: 'Overdid it', hue: T.cool, icon: TrendingUp },
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
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        <CloudSun size={15} color={T.mid} style={{ flex: 'none' }} />
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
          <Kicker>Bestes Fenster</Kicker>
          <span style={{ fontSize: 16, fontWeight: 700, letterSpacing: -0.3, color: T.ink, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{w.window}</span>
        </div>
        <div style={{ flex: 'none', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 }}>
          <span style={{ fontSize: 16, fontWeight: 700, letterSpacing: -0.3, color: T.ink }}>{w.temp}</span>
          <span style={{ fontSize: 9, fontWeight: 600, letterSpacing: 0.6, color: T.quiet }}>gefühlt {w.feels}</span>
        </div>
        <span style={{ flex: 'none', fontSize: 9, fontWeight: 700, letterSpacing: 1, color: T.mid, padding: '6px 9px', borderRadius: 100, background: T.surface2 }}>{w.verdict}</span>
      </div>
      {w.short && <span style={{ fontSize: 11, fontWeight: 500, lineHeight: 1.35, color: T.quiet }}>{w.short}</span>}
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
  dur: string | null; blocks: W3Block[]; ftpTag: string; earn: string
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
 *  columns at gap 8 → 153 per card, minus 24 padding = 129 for chip (28) + gap
 *  (10) + text (91). "285 W" at 17/700 Inter Tight is ~46, "DER FTP" ~42 — both
 *  clear, and every child carries minWidth: 0 so nothing can push the row wide. */
function StatCard({ icon: Ic, v, l, hue, span }: DayStat & { span?: boolean }) {
  const has = v !== DASH
  const on = has && hue != null
  return (
    <div style={{ gridColumn: span ? '1 / -1' : undefined, minWidth: 0, display: 'flex', alignItems: 'center', gap: 10, padding: '11px 12px', borderRadius: 16, background: T.surface2 }}>
      <div style={{ width: 28, height: 28, flex: 'none', borderRadius: 9, background: on ? T.acidDim : '#FFFFFF0F', display: 'grid', placeItems: 'center' }}>
        <Ic size={15} color={on ? T.acid : T.mid} />
      </div>
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
        <span style={{ fontSize: 17, fontWeight: 700, letterSpacing: -0.3, fontVariantNumeric: 'tabular-nums', color: has ? (hue ?? T.ink) : T.quiet, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{v}</span>
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
    { label: 'Planned', val: planned, hue: T.d3, dashed: true },
    { label: 'You rode', val: actual, hue: doneHue },
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
            ['DURATION', day.actualDurMin != null ? `${Math.floor(day.actualDurMin / 60)}:${String(Math.round(day.actualDurMin % 60)).padStart(2, '0')}` : '—'],
            ['AVG POWER', day.actualW != null ? `${Math.round(day.actualW)} W` : '—'],
            ['AVG HR', day.actualHr != null ? `${Math.round(day.actualHr)}` : '—'],
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
          {over ? 'Over the plan — watch fatigue tomorrow.' : 'Right on the number. That’s how fitness compounds.'}
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
      if (!r) setError('No plan to adapt today.')
    } catch {
      setError('Coach couldn’t re-plan right now.')
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
  const restDay = isRest || day.status === 'rest' || (isFuture && !day.title)
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
            {result?.railsDowngraded && <span style={{ color: T.warn }}> · Eased for safety.</span>}
          </span>
        </div>
      )}

      {isToday && (
        <>
          <IntervalBars blocks={session.blocks} ftpTag={session.ftpTag} h={76} />
          <span style={{ fontSize: 11.5, fontWeight: 500, lineHeight: 1.4, color: T.mid }}>{workDesc}</span>
        </>
      )}

      {isFuture && (
        <>
          {session.blocks.length > 0 && <IntervalBars blocks={session.blocks} ftpTag={session.ftpTag} h={76} />}
          <span style={{ fontSize: 11.5, fontWeight: 500, lineHeight: 1.4, color: T.quiet }}>
            Eine Woche im Voraus geplant — festgezurrt wird am Morgen, sobald deine Nachtwerte da sind.
          </span>
        </>
      )}

      {isPast && day.status !== 'rest' && (
        day.status === 'missed' ? (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <Minus size={15} color={T.warn} style={{ flex: 'none' }} />
            <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, fontWeight: 600, color: T.warn }}>Skipped — no ride logged for this session.</span>
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
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <Zap size={14} color={T.acid} style={{ flex: 'none' }} />
            <span style={{ flex: 1, minWidth: 0, fontSize: 11.5, color: T.mid, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{session.earn}</span>
          </div>
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
  return (
    <div style={band(20)}>
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

// ────────────────────────────────────────────────────────────────────────
// 6-week Fitness / Fatigue mirror chart (pen: "Where you stand · last 6 weeks")
// ────────────────────────────────────────────────────────────────────────
export interface W3Mirror { fitness: number[]; fatigue: number[]; fitnessRaw: number[]; fatigueRaw: number[]; todayIndex: number }

export function MirrorChart({ m, fitness, fatigue, form }: { m: W3Mirror; fitness: number; fatigue: number; form: number }) {
  const reduce = useReducedMotion()
  const [hov, setHov] = useState<number | null>(null)
  const H = 40
  const n = m.fitness.length
  const cur = hov ?? m.todayIndex

  const bar = (series: number[], i: number, top: boolean) => {
    const on = i === m.todayIndex
    const isHov = i === hov
    const h = Math.max(2, Math.round(series[i] * H))
    return (
      <motion.div key={i} onMouseEnter={() => setHov(i)} onMouseLeave={() => setHov(null)}
        initial={reduce ? false : { scaleY: 0 }} animate={{ scaleY: 1 }} transition={grow((i / n) * 0.3)}
        style={{ flex: 1, height: h, alignSelf: top ? 'flex-end' : 'flex-start', transformOrigin: top ? 'bottom' : 'top', borderRadius: 1.5, cursor: 'pointer',
          background: on ? (top ? T.acid : '#C8FF0080') : isHov ? T.d4 : T.d2 }} />
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', width: '100%', background: T.bg, padding: '0 20px 26px' }}>
      <div style={card()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <Kicker>Where you stand · last 6 weeks</Kicker>
            <span style={{ fontSize: 11, fontWeight: 600, color: T.mid, lineHeight: 1.35 }}>Fitness and fatigue on the same scale — the gap is your form.</span>
          </div>
          {hov != null && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: T.acid }}>{m.fitnessRaw[cur]} <span style={{ color: T.quiet, fontWeight: 600 }}>fit</span></span>
              <span style={{ fontSize: 11, fontWeight: 700, color: T.cool }}>{m.fatigueRaw[cur]} <span style={{ color: T.quiet, fontWeight: 600 }}>fat</span></span>
            </div>
          )}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 0, marginBottom: 16 }}>
          <div style={{ display: 'flex', gap: 1.5, alignItems: 'flex-end', height: H }}>{m.fitness.map((_, i) => bar(m.fitness, i, true))}</div>
          <div style={{ height: 1, background: T.d3, margin: '3px 0' }} />
          <div style={{ display: 'flex', gap: 1.5, alignItems: 'flex-start', height: H }}>{m.fatigue.map((_, i) => bar(m.fatigue, i, false))}</div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
          <span style={{ display: 'flex', gap: 5, alignItems: 'center', fontSize: 8.5, fontWeight: 600, letterSpacing: 1, color: T.quiet }}><span style={{ width: 8, height: 8, borderRadius: 2, background: T.acid }} />FITNESS · ABOVE</span>
          <span style={{ display: 'flex', gap: 5, alignItems: 'center', fontSize: 8.5, fontWeight: 600, letterSpacing: 1, color: T.quiet }}><span style={{ width: 8, height: 8, borderRadius: 2, background: '#C8FF0080' }} />FATIGUE · BELOW</span>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
          {[['FITNESS', String(fitness), T.ink, 30], ['−', '', T.quiet, 20], ['FATIGUE', String(fatigue), T.ink, 30], ['=', '', T.quiet, 20], ['FORM', form >= 0 ? `+${form}` : String(form), T.acid, 42]].map(([l, v, hue, size], i) => (
            l === '−' || l === '=' ? (
              <span key={i} style={{ fontSize: size as number, color: hue as string, paddingBottom: 14 }}>{l}</span>
            ) : (
              <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                <span style={{ fontSize: size as number, fontWeight: 700, color: hue as string, lineHeight: 1 }}>{v}</span>
                <span style={{ fontSize: 8.5, fontWeight: 600, letterSpacing: 1, color: T.quiet }}>{l}</span>
              </div>
            )
          ))}
        </div>
      </div>
    </div>
  )
}

type AdaptOpt = { key: Exclude<Adapt, 'none'>; label: string; sub: string; icon: typeof Zap }
// Intensity — persists via the modifier's easier/harder cascade (rails watch it).
const INTENSITY_OPTS: AdaptOpt[] = [
  { key: 'easier', label: 'Easier', sub: 'ease it', icon: TrendingDown },
  { key: 'harder', label: 'Harder', sub: 'push it', icon: TrendingUp },
]
// Exchange — swap the session for a different real modification the backend
// supports. There is no swap endpoint, so these are the honest levers: shorten
// to 45 min, move indoors (watts unchanged), or take the day off. Rest is the
// only deterministic one (the modifier has no rest type); the rest persist.
const EXCHANGE_OPTS: AdaptOpt[] = [
  { key: 'shorter', label: 'Shorter', sub: '45 min', icon: Clock },
  { key: 'indoor', label: 'Indoor', sub: 'trainer', icon: Home },
  { key: 'rest', label: 'Rest day', sub: '0 TSS', icon: Moon },
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
              <span style={{ fontSize: 10, fontWeight: 600, color: on ? T.acid : T.quiet }}>{loading ? 'saving…' : o.sub}</span>
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
      <AdaptGroup label="Not feeling it? The coach re-plans it" opts={INTENSITY_OPTS} adapt={adapt} busy={busy} onPick={onPick} />
      <AdaptGroup label="Exchange the session" opts={EXCHANGE_OPTS} adapt={adapt} busy={busy} onPick={onPick} />
    </div>
  )
}
