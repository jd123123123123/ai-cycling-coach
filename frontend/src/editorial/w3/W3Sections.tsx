import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, useReducedMotion } from 'motion/react'
import { CloudSun, Route as RouteIcon, MapPin, Mountain, Trophy, Check, Minus, TrendingUp, TrendingDown, Moon, Zap, ArrowRight, Sparkles, SlidersHorizontal, ChevronDown, Clock, Home } from 'lucide-react'
import { T, FONT, EASE, grow, Kicker, card, band } from './w3tokens'

// ────────────────────────────────────────────────────────────────────────
// Interactive Week strip + Day detail
// ────────────────────────────────────────────────────────────────────────
export type DayStatus = 'today' | 'hit' | 'missed' | 'over' | 'rest' | 'upcoming'
export interface W3DayFull {
  letter: string
  num: string
  actual: number        // real TSS ridden
  planned: number | null // planned TSS (null = no plan / rest)
  status: DayStatus
  title: string | null   // session name for that day
  dateLabel: string      // "Mon 11 Aug"
  weekday: string        // "Saturday" — for the training-card header
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
  today: { label: 'Today', hue: T.acid, icon: TrendingUp },
  hit: { label: 'Nailed it', hue: T.acid, icon: Check },
  missed: { label: 'Missed', hue: T.warn, icon: Minus },
  over: { label: 'Overdid it', hue: T.cool, icon: TrendingUp },
  rest: { label: 'Rest day', hue: T.mid, icon: Minus },
  upcoming: { label: 'Upcoming', hue: T.quiet, icon: Minus },
}

/** The week strip — now CONTROLLED: selecting a day drives the training
 *  recommendation card below (there is no separate detail box). */
export function WeekSection({ days, meta, selected, onSelect }: { days: W3DayFull[]; meta: string; selected: number; onSelect: (i: number) => void }) {
  const reduce = useReducedMotion()
  const max = Math.max(1, ...days.map((d) => Math.max(d.actual, d.planned ?? 0)))
  return (
    <div style={{ display: 'flex', flexDirection: 'column', width: '100%', background: T.bg, padding: '0 20px 14px', gap: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: T.quiet }}>This week</span>
        <span style={{ fontSize: 11.5, fontWeight: 600, color: T.mid }}>{meta}</span>
      </div>
      <div style={{ display: 'flex', gap: 6 }}>
        {days.map((day, i) => {
          const active = i === selected
          const isToday = day.status === 'today'
          const barH = Math.max(3, Math.round((day.actual / max) * 34))
          const planH = day.planned ? Math.max(3, Math.round((day.planned / max) * 34)) : 0
          const hue = day.status === 'hit' || isToday ? T.acid : day.status === 'over' ? T.cool : day.status === 'missed' ? T.warn : T.d2
          return (
            <button key={i} onClick={() => onSelect(i)} aria-label={`${day.dateLabel}, ${STATUS[day.status].label}`}
              style={{
                flex: 1, display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'center', padding: '10px 0 11px',
                borderRadius: 14, cursor: 'pointer', border: active ? `1.5px solid ${hue}` : '1.5px solid transparent',
                background: isToday ? T.acidDim : active ? '#FFFFFF0A' : T.surface, fontFamily: FONT,
              }}>
              <span style={{ fontSize: 9, fontWeight: 600, color: isToday ? T.acid : T.quiet }}>{day.letter}</span>
              <span style={{ fontSize: 13, fontWeight: 600, color: isToday || active ? T.ink : T.mid }}>{day.num}</span>
              <div style={{ position: 'relative', height: 34, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', padding: '0 7px', width: '100%' }}>
                {planH > 0 && <div style={{ position: 'absolute', bottom: 0, left: 7, right: 7, height: planH, borderRadius: 2, border: `1px dashed ${T.d3}`, borderBottom: 'none' }} />}
                <motion.div initial={reduce ? false : { height: 0 }} animate={{ height: barH }} transition={grow(i * 0.05)}
                  style={{ height: barH, borderRadius: 2, width: '100%', background: hue, position: 'relative' }} />
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────────
// Weather window + Route recommendation  (pen: "Where and when to ride it")
// ────────────────────────────────────────────────────────────────────────
export interface W3Weather {
  window: string; temp: string; feels: string
  hours: { label: string; q: number; peak?: boolean }[]
  meta: string
  routeName: string; routeStats: string; routeTag: string; routeWhy: string; recordProof: string
}

export function WeatherRoute({ w }: { w: W3Weather }) {
  const reduce = useReducedMotion()
  const [hov, setHov] = useState<number | null>(null)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', width: '100%', background: T.bg, padding: '0 20px 26px' }}>
      <div style={{ ...card(), gap: 16, padding: '20px 18px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: T.quiet }}>Where and when to ride it</span>
          <div style={{ display: 'flex', gap: 5, alignItems: 'center', padding: '5px 10px 5px 8px', borderRadius: 100, background: T.acidDim }}>
            <CloudSun size={12} color={T.acid} /><span style={{ fontSize: 9, fontWeight: 700, letterSpacing: 1, color: T.acid }}>GO OUTSIDE</span>
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <Kicker>Best window</Kicker>
            <span style={{ fontSize: 30, fontWeight: 700, letterSpacing: -0.8, color: T.ink }}>{w.window}</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-end' }}>
            <span style={{ fontSize: 30, fontWeight: 700, letterSpacing: -0.8, color: T.ink }}>{w.temp}</span>
            <span style={{ fontSize: 9, fontWeight: 600, letterSpacing: 1, textTransform: 'uppercase', color: T.quiet }}>Feels {w.feels}</span>
          </div>
        </div>

        {/* Interactive hourly quality bars */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
          <div style={{ position: 'relative', height: 34, display: 'flex', gap: 3, alignItems: 'flex-end' }}>
            {w.hours.map((h, i) => {
              const on = hov === i || (hov == null && h.peak)
              const bh = Math.max(4, Math.round(h.q * 34))
              return (
                <motion.div key={i} onMouseEnter={() => setHov(i)} onMouseLeave={() => setHov(null)}
                  initial={reduce ? false : { height: 0 }} animate={{ height: bh }} transition={grow(i * 0.02)}
                  style={{ flex: 1, height: bh, borderRadius: 1.5, cursor: 'pointer', background: on ? T.acid : (h.peak ? '#C8FF0088' : T.d2) }} />
              )
            })}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', height: 11 }}>
            {['08:00', '14:00', '20:00'].map((t) => <span key={t} style={{ fontSize: 9, fontWeight: 600, color: T.quiet }}>{t}</span>)}
          </div>
          <span style={{ fontSize: 11.5, fontWeight: 400, lineHeight: 1.4, color: hov != null ? T.ink : T.quiet }}>
            {hov != null ? `${w.hours[hov].label} · ride quality ${Math.round(w.hours[hov].q * 100)}%` : w.meta}
          </span>
        </div>

        {/* Route recommendation */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, paddingTop: 16, borderTop: `1px solid ${T.rule}` }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Kicker>Recommended route</Kicker>
            <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: 0.8, color: T.acid }}>{w.routeTag}</span>
          </div>
          <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
            <div style={{ width: 52, height: 52, borderRadius: 14, background: T.acidDim, display: 'grid', placeItems: 'center', flex: 'none' }}>
              <RouteIcon size={22} color={T.acid} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ fontSize: 17, fontWeight: 700, color: T.ink }}>{w.routeName}</span>
              <div style={{ display: 'flex', gap: 10 }}>
                {w.routeStats.split('·').map((s, i) => (
                  <span key={i} style={{ display: 'flex', gap: 4, alignItems: 'center', fontSize: 11, fontWeight: 600, color: T.mid }}>
                    {i === 0 ? <MapPin size={11} color={T.quiet} /> : i === 1 ? <Mountain size={11} color={T.quiet} /> : <RouteIcon size={11} color={T.quiet} />}{s.trim()}
                  </span>
                ))}
              </div>
            </div>
          </div>
          <span style={{ fontSize: 11.5, fontWeight: 400, lineHeight: 1.45, color: T.mid }}>{w.routeWhy}</span>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '12px 14px', borderRadius: 14, background: '#FFFFFF0A' }}>
            <Trophy size={15} color={T.acid} /><span style={{ fontSize: 11.5, fontWeight: 600, color: T.ink }}>{w.recordProof}</span>
          </div>
        </div>
      </div>
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

// ────────────────────────────────────────────────────────────────────────
// Training recommendation — the ONE card that reflects the selected day.
//   • today   → plan + interval bars + Start + adapt (Easier / Harder / Rest)
//   • future  → the plan only, marked "Planned"
//   • past+ridden → plan vs. what was actually ridden (Δ TSS + verdict)
//   • past+skipped → the plan, marked "Skipped"
// ────────────────────────────────────────────────────────────────────────
export interface W3Block { w: number; work: boolean; label: string }
export interface TodaySession {
  dur: string | null; blocks: W3Block[]; ftpTag: string; earn: string
}

export function IntervalBars({ blocks, ftpTag }: { blocks: W3Block[]; ftpTag: string }) {
  const reduce = useReducedMotion()
  const [hov, setHov] = useState<number | null>(null)
  return (
    <div style={{ position: 'relative', height: 96, display: 'flex', gap: 2, alignItems: 'flex-end', marginBottom: 16 }}>
      {blocks.map((b, i) => {
        const bh = Math.round(b.w * 96)
        const on = hov === i
        return (
          <motion.div key={i} onMouseEnter={() => setHov(i)} onMouseLeave={() => setHov(null)}
            initial={reduce ? false : { height: 0 }} animate={{ height: bh }} transition={grow(i * 0.05)}
            style={{ width: b.work ? 39 : 20, height: bh, borderRadius: '3px 3px 0 0', flex: b.work ? 'none' : 1, cursor: 'pointer',
              background: b.work ? `linear-gradient(180deg, ${T.acid}, ${T.acidDeep})` : '#FFFFFF2B', outline: on ? `1px solid ${T.ink}` : 'none' }} />
        )
      })}
      <div style={{ position: 'absolute', top: 18, left: 0, right: 0, height: 1, background: '#FFFFFF66' }} />
      <span style={{ position: 'absolute', top: 4, left: 0, fontSize: 9, fontWeight: 600, letterSpacing: 1, color: T.mid }}>
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

function StatCol({ v, l, hue }: { v: string; l: string; hue?: string }) {
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 3 }}>
      <span style={{ fontSize: 17, fontWeight: 700, color: hue ?? T.ink }}>{v}</span>
      <Kicker>{l}</Kicker>
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
            <div style={{ flex: 1, height: 14, borderRadius: 100, background: '#FFFFFF0A', overflow: 'hidden' }}>
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
            <div key={l} style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 3, padding: '10px 12px', borderRadius: 14, background: T.surface2 }}>
              <span style={{ fontSize: 15, fontWeight: 800, letterSpacing: -0.4, color: v === '—' ? T.quiet : T.ink }}>{v}</span>
              <span style={{ fontSize: 8, fontWeight: 700, letterSpacing: 0.8, color: T.quiet }}>{l}</span>
            </div>
          ))}
        </div>
      )}
      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        {delta != null && (
          <span style={{ display: 'flex', gap: 5, alignItems: 'center', padding: '5px 11px', borderRadius: 100, background: `${doneHue}1F`, fontSize: 11, fontWeight: 800, color: doneHue }}>
            {over ? <TrendingUp size={12} /> : <Check size={12} />}{delta > 0 ? '+' : ''}{delta} TSS
          </span>
        )}
        <span style={{ flex: 1, fontSize: 11.5, fontWeight: 600, lineHeight: 1.35, color: T.mid }}>
          {over ? 'Over the plan — watch fatigue tomorrow.' : 'Right on the number. That’s how fitness compounds.'}
        </span>
      </div>
    </div>
  )
}

export function TrainingSection({ day, session, onAdapt }: { day: W3DayFull; session: TodaySession; onAdapt?: OnAdapt }) {
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
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: 2 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        <span style={{ fontSize: 20, fontWeight: 700, letterSpacing: -0.5, color: T.ink }}>
          {isToday ? 'Today’s Training' : `${day.weekday}’s session`}
        </span>
        <span style={{ fontSize: 10.5, fontWeight: 600, color: T.quiet }}>
          {isToday ? 'Earned by training, not bought' : day.dateLabel}
        </span>
      </div>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', padding: '7px 12px', borderRadius: 100, background: `${st.hue}1F` }}>
        <StIcon size={12} color={st.hue} />
        <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', color: st.hue }}>
          {isToday ? 'Threshold' : st.label}
        </span>
      </div>
    </div>
  )

  // A future day with no prescribed session IS a rest day (the plan schedules
  // rest; the coach fills training days a week ahead and re-plans each morning).
  const restDay = isRest || day.status === 'rest' || (isFuture && !day.title)
  if (restDay && !isPast) {
    return (
      <div style={{ ...band(26), gap: 10 }}>
        {header}
        <div style={{ ...card(), gap: 14, alignItems: 'flex-start' }}>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <div style={{ width: 44, height: 44, borderRadius: 14, background: '#00E5FF1F', display: 'grid', placeItems: 'center' }}><Moon size={20} color="#00E5FF" /></div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              <span style={{ fontSize: 22, fontWeight: 700, color: T.ink }}>Rest day</span>
              <span style={{ fontSize: 12, fontWeight: 600, color: T.mid }}>{isToday ? 'Let today’s load settle — 0 TSS. Tomorrow’s block hits harder for it.' : 'Recovery is scheduled here — 0 TSS. The coach fills training days a week ahead and re-plans each morning.'}</span>
            </div>
          </div>
          {isToday && <AdaptRow adapt={adapt} busy={busy} onPick={runAdapt} />}
        </div>
      </div>
    )
  }

  return (
    <div style={{ ...band(26), gap: 10 }}>
      {header}
      <motion.div key={day.dateLabel + adapt} initial={reduce ? false : { opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.28, ease: EASE }}
        style={{ ...card(), opacity: day.status === 'missed' ? 0.72 : 1 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: T.quiet }}>
            {isToday ? 'Today’s session' : isFuture ? 'Planned session' : 'The plan was'}
          </span>
          <span style={{ fontSize: 11.5, fontWeight: 600, color: T.mid }}>{isToday ? session.dur : ''}</span>
        </div>
        <div style={{ fontSize: 26, fontWeight: 700, letterSpacing: -0.6, lineHeight: 1, color: day.title ? T.ink : T.mid, marginBottom: 16 }}>
          {day.title ?? (isFuture ? `${day.weekday}’s ride isn’t set yet` : 'Rest day')}
        </div>

        {/* Stats only when there's a real prescription (title + a number). A
            future day with no plan yet hides the empty dash row. */}
        {(day.title != null && (curTss > 0 || curT > 0)) && (
          <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
            <StatCol v={curT ? `${curT} W` : '—'} l="TARGET" hue={adapted && isToday ? T.acid : undefined} />
            <StatCol v={curTss ? `${curTss}` : '—'} l="PLANNED TSS" hue={adapted && isToday ? T.acid : undefined} />
            <StatCol v={curFtp ? `${curFtp}%` : '—'} l="OF FTP" />
          </div>
        )}

        {/* the coach's own explanation of the re-plan (real AI rationale) */}
        {isToday && adapted && (result || error) && (
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', padding: '10px 12px', marginBottom: 12, borderRadius: 12, background: T.acidDim }}>
            <Sparkles size={13} color={T.acid} style={{ flex: 'none', marginTop: 1 }} />
            <span style={{ fontSize: 11.5, fontWeight: 600, lineHeight: 1.4, color: error ? T.warn : T.ink }}>
              {error ?? result?.rationale}
              {result?.railsDowngraded && <span style={{ color: T.warn }}> · Eased for safety.</span>}
            </span>
          </div>
        )}

        {isToday && (
          <>
            <IntervalBars blocks={session.blocks} ftpTag={session.ftpTag} />
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', paddingTop: 13, borderTop: `1px solid ${T.rule}`, marginBottom: 4 }}>
              <Zap size={14} color={T.acid} /><span style={{ fontSize: 11.5, color: T.mid }}>{session.earn}</span>
            </div>
            <button onClick={() => navigate('/e/w3-session')}
              style={{ height: 54, width: '100%', borderRadius: 100, background: T.acid, border: 0, cursor: 'pointer', fontFamily: FONT, display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 8px 0 22px', marginTop: 12 }}>
              <span style={{ fontSize: 17, fontWeight: 600, letterSpacing: -0.2, color: T.bg }}>View workout</span>
              <div style={{ width: 38, height: 38, borderRadius: 100, background: T.bg, display: 'grid', placeItems: 'center' }}><ArrowRight size={18} color={T.acid} /></div>
            </button>
          </>
        )}

        {isFuture && (
          <>
            {session.blocks.length > 0 && <IntervalBars blocks={session.blocks} ftpTag={session.ftpTag} />}
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', paddingTop: 13, borderTop: `1px solid ${T.rule}` }}>
              <span style={{ fontSize: 11.5, color: T.quiet }}>Planned a week ahead — locks in the morning of, once your overnight signals are in.</span>
            </div>
          </>
        )}

        {isPast && day.status !== 'rest' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, paddingTop: 14, borderTop: `1px solid ${T.rule}` }}>
            {day.status === 'missed' ? (
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <Minus size={15} color={T.warn} /><span style={{ fontSize: 13, fontWeight: 600, color: T.warn }}>Skipped — no ride logged for this session.</span>
              </div>
            ) : (
              <PlannedVsDone day={day} reduce={reduce} />
            )}
          </div>
        )}
      </motion.div>

      {/* Adapt options hidden behind an "Adjust" toggle (like the old Today's
          "anpassen") — the plan reads clean; tap to re-plan with the coach. */}
      {isToday && (
        showAdapt ? (
          <AdaptRow adapt={adapt} busy={busy} onPick={runAdapt} />
        ) : (
          <button onClick={() => setShowAdapt(true)}
            style={{ display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'center', height: 44, borderRadius: 100, background: T.surface, border: `1px solid ${T.rule}`, cursor: 'pointer', fontFamily: FONT }}>
            <SlidersHorizontal size={14} color={T.mid} />
            <span style={{ fontSize: 12.5, fontWeight: 700, letterSpacing: 0.3, color: T.mid }}>Adjust</span>
            <ChevronDown size={14} color={T.quiet} />
          </button>
        )
      )}
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
                flex: 1, display: 'flex', flexDirection: 'column', gap: 3, alignItems: 'center', padding: '11px 0', cursor: busy !== 'none' ? 'default' : 'pointer',
                borderRadius: 14, fontFamily: FONT, background: on ? T.acidDim : T.surface, border: `1px solid ${on ? T.acid : 'transparent'}`, opacity: busy !== 'none' && !loading ? 0.5 : 1,
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
