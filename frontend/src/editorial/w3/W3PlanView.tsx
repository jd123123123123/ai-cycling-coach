import { useMemo, useState, type CSSProperties, type ReactNode } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import {
  SlidersHorizontal, Pencil, Flag, ChevronRight, Activity,
  Zap, ArrowRight, RefreshCw, Repeat, ChevronDown, ChevronUp, X, Minus, Plus, Check,
} from 'lucide-react'
import { T, FONT, EASE, grow, Kicker, DASH } from './w3tokens'
import { TNUM } from './w3surfaces'
import W3StatusBar from './W3StatusBar'
import W3TopBar from './W3TopBar'
import type { PhaseSeg, WeekBar } from './w3plan'
import './w3.css'

/**
 * W3 · TRAININGSPLAN — a 1:1 code rebuild of the `pen2` frame `i3tIj`.
 *
 * Pure function of `vm`; `W3PlanPage` builds the vm from the REAL periodization
 * engine (`useCurrentWeek` mesocycle context, `/plan/build` weekly-TSS series,
 * the athlete FTP/weight, the season's activities, the /weeks projection). The
 * folded sheets — "Plan anpassen" (pen `F2sjUl`) and "Ziel wählen" (pen
 * `QOw05`) — collect real inputs and call the REAL `/plan/change/apply`.
 *
 * Honesty contract: structural numbers (days-to-event, plan week N of M, weekly
 * TSS, the session's watts/TSS/%FTP) resolve to a value or "—". The phase
 * week-RANGES and the block's coach prose are DERIVED from the real active
 * phase (marked `derived:` in the page); nothing is fabricated.
*
 * ACID ANSWERS ONE QUESTION: WHERE AM I, AND WHAT DO I DO NEXT.
 *
 * There were forty acid references on this screen. Most were legitimate state —
 * the current phase, the current week, today — but five were decoration: the
 * "DEIN ZIEL" eyebrow, an info glyph, a link-card value, a week label already
 * stated by the bar beside it, and the reward line directly above an acid CTA.
 * With the accent on everything, "this is where you are" stopped being readable
 * as a signal, which is the one job it has on a plan.
 *
 * The rule now: acid marks the countdown (the page's subject), the CURRENT
 * phase/week/day, the block's progress fill, and the primary action. Nothing
 * else. Two acid marks in one card is the failure mode — the reward line and
 * the "Fahrt starten" pill were exactly that.
 *
 * TYPOGRAPHY: THE W3:RIDE CEILING. The shipped app has no Bold — SemiBold is
 * the heaviest weight in the product (`docs/research/2026-08-w3ride`), and its
 * display numerals run 44–109px. Presence comes from SIZE, never from weight.
 * This page had 45 uses of 700 against 26 of 600, so almost every string on it
 * was set at the same shout and the hierarchy had to be carried by position
 * alone. Nothing here is heavier than SemiBold now; the countdown carries the
 * page instead, at the size that job deserves.
 */

// ── view model ──
export interface PlanStat { value: string; label: string }
export interface PlanDayCell { letter: string; date: string; frac: number; isToday: boolean; isRest: boolean }
export interface PlanSessionBar { w: number; work: boolean }
export interface ActiveBlockVm {
  phase: string
  dateRange: string
  weekOfBlock: string
  restNote: string | null
  text: string
  tags: string[]
  next: string
}
export interface W3PlanVm {
  eventName: string
  eventSub: string
  daysToStart: number | null
  weeksDaysLabel: string
  planWeekLabel: string
  phases: PhaseSeg[]
  railProgress: number
  planWeekNum: number
  totalWeeks: number
  reqSummary: string
  daysRight: string
  phaseOfTotal: string
  block: ActiveBlockVm | null
  avgTss: string
  weekBars: WeekBar[]
  weekRangeLabel: string
  weekBadge: string
  weekStats: [PlanStat, PlanStat, PlanStat, PlanStat]
  dayStrip: PlanDayCell[]
  sessionTitle: string | null
  sessionDur: string | null
  targetW: string
  sessionTss: string
  ftpPct: string
  ftpTag: string
  sessionBars: PlanSessionBar[]
  easierTss: string
  harderTss: string
  earnNote: string
  forecastValue: string
  adaptExplainer: string
  // sheet defaults (real current profile values)
  adjustDays: boolean[]        // Mon..Sun
  adjustHours: number          // decimal hours
  adjustLongDay: number        // 5=Sat 6=Sun (index into Mon..Sun)
  goalOptions: GoalOption[]
}
export interface GoalOption {
  id: string
  icon: 'flag' | 'gauge' | 'trend' | 'base'
  title: string
  meta: string
  desc: string
  state: 'active' | 'selected' | 'idle'
  real: boolean            // whether picking it maps to a real /plan/change/apply
}

export type AdaptKind = 'easier' | 'harder' | 'shorter' | 'indoor' | 'rest'
export interface AdaptResult { title: string | null; tss: number | null; note: string; railsDowngraded: boolean }
export type OnAdapt = (kind: AdaptKind) => Promise<AdaptResult | null>

export interface GoalSwitchPayload { goal_changed: 'no_event' | 'new_event' | 'same'; goal_new?: 'race' | 'fondo' | 'audax' | 'maintenance' }
export interface RebuildPayload { weekly_hours: number; days: boolean[]; longDay: number }

export interface W3PlanActions {
  onBack?: () => void
  onGoal?: () => void
  onLoad?: () => void
  onStartRide?: () => void
  onAdapt?: OnAdapt
  onRebuild?: (p: RebuildPayload) => Promise<boolean>
  onSwitchGoal?: (id: string, p: GoalSwitchPayload) => Promise<boolean>
}

// ── scaffold ──
const band = (padBottom: number): CSSProperties => ({ display: 'flex', flexDirection: 'column', width: '100%', background: T.bg, padding: `0 20px ${padBottom}px` })
const card = (): CSSProperties => ({ background: T.surface, borderRadius: 24, padding: 20, display: 'flex', flexDirection: 'column', width: '100%' })

function SectionTitle({ title, right }: { title: string; right?: ReactNode }) {
  return (
    <div style={{ ...band(0), paddingBottom: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
      <span style={{ fontSize: 24, fontWeight: 600, letterSpacing: -0.6, color: T.ink }}>{title}</span>
      {right}
    </div>
  )
}

const IconBtn = ({ children, onClick, label }: { children: ReactNode; onClick?: () => void; label: string }) => (
  <button onClick={onClick} aria-label={label} style={{ width: 40, height: 40, borderRadius: 100, background: T.surface, border: 0, display: 'grid', placeItems: 'center', cursor: 'pointer' }}>{children}</button>
)

// ── phase rail ──
const parseWeeks = (w: string): [number, number] => { const m = w.replace('W', '').split('–').map(Number); return [m[0] || 1, m[1] || m[0] || 1] }

/** The pen `GjCmn` plan rail: a per-WEEK segmented track (current week acid-lit,
 *  past weeks filled, future weeks empty) with an acid underline spanning the
 *  ACTIVE phase, and the four phase labels sized to their week span. */
function PhaseRail({ phases, currentWeek, totalWeeks }: { phases: PhaseSeg[]; currentWeek: number; totalWeeks: number }) {
  const reduce = useReducedMotion()
  const active = phases.find((p) => p.active)
  const [aFrom, aTo] = active ? parseWeeks(active.weeks) : [0, 0]
  const weeks = Array.from({ length: Math.max(1, totalWeeks) }, (_, i) => i + 1)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, width: '100%' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {/* per-week segments */}
        <div style={{ display: 'flex', gap: 3, height: 10 }}>
          {weeks.map((w) => {
            const cur = w === currentWeek
            const fill = cur ? T.acid : w < currentWeek ? T.d3 : T.surface2
            return <motion.div key={w} initial={reduce ? false : { opacity: 0, scaleY: 0.4 }} animate={{ opacity: 1, scaleY: 1 }} transition={grow(w * 0.02)}
              style={{ flex: 1, height: 10, borderRadius: 3, background: fill, boxShadow: cur ? `0 0 10px ${T.acid}77` : 'none' }} />
          })}
        </div>
        {/* active-phase underline */}
        <div style={{ display: 'flex', gap: 3, height: 2 }}>
          {weeks.map((w) => <div key={w} style={{ flex: 1, height: 2, borderRadius: 100, background: w >= aFrom && w <= aTo ? T.acid : 'transparent' }} />)}
        </div>
      </div>
      {/* phase labels, sized to their week span */}
      <div style={{ display: 'flex', gap: 4 }}>
        {phases.map((p, i) => {
          const [f, t] = parseWeeks(p.weeks)
          return (
            <div key={i} style={{ flex: Math.max(1, t - f + 1), display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
              <span style={{ fontSize: 11, fontWeight: 600, color: p.active ? T.acid : T.mid, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.name}</span>
              <span style={{ fontSize: 10, fontWeight: 600, color: p.active ? T.acidDeep : T.quiet }}>{p.weeks}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── 12-week chart ──
function WeekChart({ bars }: { bars: WeekBar[] }) {
  const reduce = useReducedMotion()
  const max = Math.max(1, ...bars.map((b) => b.tss ?? 0))
  const H = 118
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', gap: 5, alignItems: 'flex-end', height: H }}>
        {bars.map((b, i) => {
          const h = Math.max(4, Math.round(((b.tss ?? 0) / max) * H))
          const isCur = b.kind === 'current'
          const fill = isCur ? T.acid
            : b.kind === 'done' ? T.d4
              : b.kind === 'rest' ? T.d2 : T.d2
          return (
            <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
              <motion.div initial={reduce ? false : { height: 0 }} animate={{ height: h }} transition={grow(i * 0.03)}
                style={{
                  width: '100%', height: h, borderRadius: '4px 4px 0 0',
                  background: isCur ? `linear-gradient(180deg, ${T.acid}, ${T.acidDeep})` : fill,
                  border: b.kind === 'planned' ? `1px dashed ${T.d3}` : 'none',
                  boxShadow: isCur ? `0 0 14px ${T.acid}55` : 'none',
                }} />
            </div>
          )
        })}
      </div>
      <div style={{ display: 'flex', gap: 5 }}>
        {bars.map((b, i) => (
          <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
            <span style={{ fontSize: 9.5, fontWeight: 600, color: b.kind === 'current' ? T.acid : T.quiet }}>{b.idx}</span>
            {b.isRest && <div style={{ width: 3, height: 3, borderRadius: 100, background: T.mid }} />}
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', paddingTop: 4 }}>
        {[['gefahren', T.d4], ['geplant', T.d2], ['diese Woche', T.acid], ['Ruhewoche', T.mid]].map(([l, c]) => (
          <div key={l} style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
            <div style={{ width: 8, height: 8, borderRadius: l === 'Ruhewoche' ? 100 : 2, background: c as string }} />
            <span style={{ fontSize: 9.5, fontWeight: 600, color: T.quiet }}>{l}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── session beam ──
function SessionBeam({ bars, ftpTag }: { bars: PlanSessionBar[]; ftpTag: string }) {
  const reduce = useReducedMotion()
  const H = 96
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {ftpTag && <span style={{ fontSize: 10, fontWeight: 600, color: T.mid }}>{ftpTag}</span>}
      <div style={{ position: 'relative', height: H, display: 'flex', gap: 2, alignItems: 'flex-end' }}>
        {bars.map((b, i) => {
          const h = Math.max(4, Math.round(b.w * H))
          return (
            <motion.div key={i} initial={reduce ? false : { height: 0 }} animate={{ height: h }} transition={grow(i * 0.025)}
              style={{ flex: 1, height: h, borderRadius: '3px 3px 0 0', background: b.work ? `linear-gradient(180deg, ${T.acid}, ${T.acidDeep})` : '#FFFFFF24' }} />
          )
        })}
        <div style={{ position: 'absolute', top: 14, left: 0, right: 0, height: 1, background: '#FFFFFF80' }} />
      </div>
    </div>
  )
}

// ── Plan anpassen sheet (pen F2sjUl) ──
function PlanAdjustSheet({ vm, onClose, onRebuild }: { vm: W3PlanVm; onClose: () => void; onRebuild?: W3PlanActions['onRebuild'] }) {
  const [days, setDays] = useState<boolean[]>(vm.adjustDays)
  const [hours, setHours] = useState<number>(vm.adjustHours)
  const [longDay, setLongDay] = useState<number>(vm.adjustLongDay)
  const [rest, setRest] = useState<'3:1' | '2:1'>('3:1')     // display cadence — fixture (no dedicated field)
  const [indoor, setIndoor] = useState<'wenig' | 'mittel' | 'viel'>('mittel') // fixture (no dedicated field)
  const [busy, setBusy] = useState(false)
  const dayCount = days.filter(Boolean).length
  const newTss = Math.round((hours / vm.adjustHours) * (Number(vm.weekStats[1].value.replace(/\D/g, '')) || 0)) || null

  const submit = async () => {
    if (!onRebuild || busy) return
    setBusy(true)
    const ok = await onRebuild({ weekly_hours: Math.round(hours), days, longDay })
    setBusy(false)
    if (ok) onClose()
  }
  const pill = (on: boolean): CSSProperties => ({
    padding: '9px 0', borderRadius: 14, textAlign: 'center', fontSize: 13, fontWeight: 600, cursor: 'pointer', border: `1px solid ${on ? T.acid : T.stroke}`,
    background: on ? T.acidDim : 'transparent', color: on ? T.acid : T.mid,
  })
  return (
    <SheetShell onClose={onClose}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          <span style={{ fontSize: 26, fontWeight: 600, letterSpacing: -0.6, color: T.ink }}>Plan anpassen</span>
          <span style={{ fontSize: 12, fontWeight: 600, color: T.quiet }}>Gilt ab der nächsten Woche · erledigte Wochen bleiben</span>
        </div>
        <IconBtn onClick={onClose} label="Schließen"><X size={18} color={T.ink} /></IconBtn>
      </div>

      {/* Trainingstage */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span style={{ fontSize: 17, fontWeight: 600, color: T.ink }}>Trainingstage</span>
            <span style={{ fontSize: 12, fontWeight: 600, color: T.quiet }}>An welchen Tagen du fahren kannst</span>
          </div>
          <span style={{ fontSize: 15, fontWeight: 600, color: T.mid }}>{dayCount} Tage</span>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          {['MO', 'DI', 'MI', 'DO', 'FR', 'SA', 'SO'].map((d, i) => (
            <div key={d} style={{ flex: 1, ...pill(days[i]) }} role="button" tabIndex={0}
              onClick={() => setDays((prev) => prev.map((v, j) => (j === i ? !v : v)))}>{d}</div>
          ))}
        </div>
      </div>

      <SheetRow title="Stunden pro Woche" sub={`Aktuell ${fmtHM(vm.adjustHours)} h · Korridor 6:00 – 11:00`}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '8px 12px', borderRadius: 100, background: T.surface2 }}>
          <button aria-label="weniger" onClick={() => setHours((h) => Math.max(6, +(h - 0.25).toFixed(2)))} style={stepBtn}><Minus size={16} color={T.ink} /></button>
          <span style={{ fontSize: 16, fontWeight: 600, color: T.ink, minWidth: 44, textAlign: 'center' }}>{fmtHM(hours)}</span>
          <button aria-label="mehr" onClick={() => setHours((h) => Math.min(11, +(h + 0.25).toFixed(2)))} style={stepBtn}><Plus size={16} color={T.ink} /></button>
        </div>
      </SheetRow>

      <SheetRow title="Lange Ausfahrt" sub="Der Schlüsseltag der Woche">
        <Segmented options={[['SA', 5], ['SO', 6]]} value={longDay} onChange={setLongDay} />
      </SheetRow>

      <SheetRow title="Ruhewoche" sub="Entlastung im Rhythmus">
        <Segmented options={[['3:1', 0], ['2:1', 1]]} value={rest === '3:1' ? 0 : 1} onChange={(v) => setRest(v === 0 ? '3:1' : '2:1')} />
      </SheetRow>

      <SheetRow title="Indoor-Anteil" sub="Wie viel auf der Rolle laufen darf">
        <Segmented options={[['WENIG', 0], ['MITTEL', 1], ['VIEL', 2]]} value={indoor === 'wenig' ? 0 : indoor === 'mittel' ? 1 : 2}
          onChange={(v) => setIndoor(v === 0 ? 'wenig' : v === 1 ? 'mittel' : 'viel')} />
      </SheetRow>

      <div style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '12px 14px', borderRadius: 14, border: `1px solid ${T.stroke}` }}>
        <div style={{ width: 20, height: 20, borderRadius: 100, border: `1.5px solid ${T.acid}`, display: 'grid', placeItems: 'center', flex: 'none' }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: T.quiet }}>i</span>
        </div>
        <span style={{ fontSize: 12.5, fontWeight: 600, color: T.mid }}>
          Neue Wochenlast: {vm.weekStats[1].value} → {newTss != null ? `${newTss} TSS` : '—'} · {dayCount} Einheiten bleiben
        </span>
      </div>

      <button onClick={submit} disabled={busy || !onRebuild}
        style={{ height: 56, borderRadius: 100, background: T.evening, display: 'flex', gap: 10, justifyContent: 'center', alignItems: 'center', border: 0, cursor: busy ? 'default' : 'pointer', fontFamily: FONT, opacity: busy ? 0.7 : 1 }}>
        <RefreshCw size={18} color={T.ink} /><span style={{ fontSize: 16, fontWeight: 600, color: T.ink }}>{busy ? 'Rechne…' : 'Plan neu berechnen'}</span>
      </button>
    </SheetShell>
  )
}

// ── Ziel wählen sheet (pen QOw05) ──
function GoalSwitchSheet({ vm, onClose, onSwitchGoal }: { vm: W3PlanVm; onClose: () => void; onSwitchGoal?: W3PlanActions['onSwitchGoal'] }) {
  const [sel, setSel] = useState<string>(vm.goalOptions.find((g) => g.state === 'selected')?.id ?? vm.goalOptions.find((g) => g.state === 'active')?.id ?? vm.goalOptions[0]?.id ?? '')
  const [busy, setBusy] = useState(false)
  const chosen = vm.goalOptions.find((g) => g.id === sel)
  const icon = (k: GoalOption['icon']) => k === 'flag' ? <Flag size={18} color={T.acid} /> : k === 'gauge' ? <Activity size={18} color={T.evening} /> : k === 'trend' ? <ArrowRight size={18} color={T.mid} style={{ transform: 'rotate(-45deg)' }} /> : <Repeat size={18} color={T.mid} />

  const submit = async () => {
    if (!onSwitchGoal || !chosen || busy) return
    setBusy(true)
    // Map the picked preset to the real /plan/change/apply vocabulary. Only the
    // race (keep) and the no-event "Grundlage halten" map cleanly; block presets
    // rebuild as a fitness horizon (goal_changed:no_event) — the closest real action.
    const payload: GoalSwitchPayload = chosen.id === 'race' ? { goal_changed: 'same' } : { goal_changed: 'no_event' }
    const ok = await onSwitchGoal(chosen.id, payload)
    setBusy(false)
    if (ok) onClose()
  }
  return (
    <SheetShell onClose={onClose}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={{ fontSize: 26, fontWeight: 600, letterSpacing: -0.6, color: T.ink }}>Wofür trainierst du?</span>
          <span style={{ fontSize: 12.5, fontWeight: 600, color: T.quiet, lineHeight: 1.4 }}>Ein Ziel bestimmt Länge, Phasen und Intensität. Wechseln geht jederzeit – erledigte Wochen bleiben erhalten.</span>
        </div>
        <IconBtn onClick={onClose} label="Schließen"><X size={18} color={T.ink} /></IconBtn>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {vm.goalOptions.map((g) => {
          const on = g.id === sel
          const accent = g.icon === 'flag' ? T.acid : g.icon === 'gauge' ? T.evening : T.stroke
          return (
            <button key={g.id} onClick={() => setSel(g.id)}
              style={{ display: 'flex', gap: 14, alignItems: 'center', padding: 16, borderRadius: 20, background: T.surface, border: `1.5px solid ${on ? accent : 'transparent'}`, cursor: 'pointer', fontFamily: FONT, textAlign: 'left' }}>
              <div style={{ width: 46, height: 46, borderRadius: 14, background: on ? (g.icon === 'flag' ? T.acidDim : '#7B5CFF1F') : T.surface2, display: 'grid', placeItems: 'center', flex: 'none' }}>{icon(g.icon)}</div>
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 3 }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 17, fontWeight: 600, color: T.ink }}>{g.title}</span>
                  <span style={{ fontSize: 10.5, fontWeight: 600, letterSpacing: 0.4, color: g.state === 'active' ? T.acid : g.state === 'selected' ? T.evening : T.quiet }}>{g.meta}</span>
                </div>
                <span style={{ fontSize: 12, fontWeight: 600, color: T.quiet, lineHeight: 1.35 }}>{g.desc}</span>
              </div>
              <div style={{ width: 24, height: 24, borderRadius: 100, border: `2px solid ${on ? accent : T.d3}`, display: 'grid', placeItems: 'center', flex: 'none', background: on && g.icon !== 'flag' ? T.evening : 'transparent' }}>
                {on && (g.icon === 'flag' ? <div style={{ width: 10, height: 10, borderRadius: 100, background: T.acid }} /> : <Check size={13} color={T.ink} />)}
              </div>
            </button>
          )
        })}
      </div>
      {chosen && !chosen.real && (
        <span style={{ fontSize: 11.5, fontWeight: 600, color: T.warn }}>
          Vorschau für den {chosen.title}. Dein Renntag bleibt gespeichert und lässt sich später wieder aktivieren.
        </span>
      )}
      <button onClick={submit} disabled={busy || !onSwitchGoal}
        style={{ height: 56, borderRadius: 100, background: T.evening, display: 'flex', gap: 10, justifyContent: 'center', alignItems: 'center', border: 0, cursor: busy ? 'default' : 'pointer', fontFamily: FONT, opacity: busy ? 0.7 : 1 }}>
        <Check size={18} color={T.ink} /><span style={{ fontSize: 16, fontWeight: 600, color: T.ink }}>{busy ? 'Übernehme…' : 'Ziel übernehmen'}</span>
      </button>
    </SheetShell>
  )
}

// ── sheet primitives ──
const stepBtn: CSSProperties = { width: 30, height: 30, borderRadius: 100, background: T.surface, border: 0, display: 'grid', placeItems: 'center', cursor: 'pointer' }
function fmtHM(dec: number): string { const h = Math.floor(dec); const m = Math.round((dec - h) * 60); return `${h}:${String(m).padStart(2, '0')}` }

function SheetRow({ title, sub, children }: { title: string; sub: string; children: ReactNode }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, paddingTop: 16, borderTop: `1px solid ${T.rule}` }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <span style={{ fontSize: 17, fontWeight: 600, color: T.ink }}>{title}</span>
        <span style={{ fontSize: 12, fontWeight: 600, color: T.quiet }}>{sub}</span>
      </div>
      {children}
    </div>
  )
}
function Segmented({ options, value, onChange }: { options: [string, number][]; value: number; onChange: (v: number) => void }) {
  return (
    <div style={{ display: 'flex', gap: 4, padding: 4, borderRadius: 100, background: T.surface2 }}>
      {options.map(([label, v]) => {
        const on = v === value
        return (
          <button key={label} onClick={() => onChange(v)}
            style={{ padding: '7px 14px', borderRadius: 100, border: 0, cursor: 'pointer', fontFamily: FONT, fontSize: 12.5, fontWeight: 600, background: on ? T.acid : 'transparent', color: on ? T.bg : T.mid }}>{label}</button>
        )
      })}
    </div>
  )
}
function SheetShell({ children, onClose }: { children: ReactNode; onClose: () => void }) {
  const reduce = useReducedMotion()
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: '#000000B0' }} />
      <motion.div initial={reduce ? false : { y: '100%' }} animate={{ y: 0 }} transition={{ duration: 0.4, ease: EASE }}
        style={{ position: 'relative', background: T.bg, borderRadius: '28px 28px 0 0', padding: '12px 20px calc(28px + env(safe-area-inset-bottom))', maxHeight: '92dvh', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 22, boxShadow: `0 -1px 0 ${T.stroke}` }}>
        <div style={{ width: 42, height: 5, borderRadius: 100, background: T.d3, alignSelf: 'center' }} />
        {children}
      </motion.div>
    </div>
  )
}

// ── main view ──
export default function W3PlanView({
  vm, chromeless = false,
  onBack, onGoal, onLoad, onStartRide, onAdapt, onRebuild, onSwitchGoal,
}: { vm: W3PlanVm; chromeless?: boolean } & W3PlanActions) {
  const reduce = useReducedMotion()
  const [sheet, setSheet] = useState<null | 'adjust' | 'goal'>(null)
  const [swapOpen, setSwapOpen] = useState(false)
  const [adaptMsg, setAdaptMsg] = useState<string | null>(null)
  const [adaptBusy, setAdaptBusy] = useState<AdaptKind | null>(null)

  const doAdapt = async (kind: AdaptKind) => {
    if (!onAdapt || adaptBusy) return
    setAdaptBusy(kind); setSwapOpen(false)
    const res = await onAdapt(kind)
    setAdaptBusy(null)
    setAdaptMsg(res ? (res.railsDowngraded ? `${res.note} · Sicherheitsgrenze aktiv` : res.note) : 'Keine Einheit zum Anpassen.')
  }

  const stripMax = useMemo(() => Math.max(1, ...vm.dayStrip.map((d) => d.frac)), [vm.dayStrip])

  return (
    <div className="w3-root">
      <div className="w3-frame" style={{ fontFamily: FONT, display: 'flex', flexDirection: 'column', minHeight: '100dvh' }}>
        {/* IN THE ROOM THE CHROME IS THE ROOM'S. The hero already carries the
            status bar, the machine and the tab bar, so drawing a second header
            underneath it is the "weird other top menu" that made moving between
            tabs feel like moving between apps. Standalone — the preview route,
            a deep link past the shell — this page is still a page and keeps its
            own bar. The plan-adjust control moves into the goal header below,
            where it is next to the thing it adjusts. */}
        {!chromeless && <>
          <W3StatusBar />
          <W3TopBar title="Trainingsplan" onBack={onBack}
            extra={<IconBtn onClick={() => setSheet('adjust')} label="Plan anpassen"><SlidersHorizontal size={17} color={T.ink} /></IconBtn>} />
        </>}

        {/* Goal header */}
        <div style={{ ...band(20), paddingTop: chromeless ? 16 : 8, gap: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: 1, color: T.quiet }}>DEIN ZIEL</span>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <button onClick={onGoal} style={{ display: 'flex', gap: 6, alignItems: 'center', padding: '7px 12px', borderRadius: 100, border: `1px solid ${T.stroke}`, background: 'transparent', cursor: 'pointer', fontFamily: FONT }}>
                <Pencil size={12} color={T.mid} /><span style={{ fontSize: 10.5, fontWeight: 600, letterSpacing: 0.6, color: T.mid }}>ZIEL ÄNDERN</span>
              </button>
              {/* THE ADJUST CONTROL FOLLOWS THE CHROME. It lived in the top
                  bar's `extra`, so dropping the bar in the room would have
                  stranded the only way to reach "Plan anpassen". Here it is
                  beside the goal it adjusts, which is arguably where it always
                  belonged. */}
              {chromeless && (
                <IconBtn onClick={() => setSheet('adjust')} label="Plan anpassen">
                  <SlidersHorizontal size={17} color={T.ink} />
                </IconBtn>
              )}
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {/* ── ONE HERO, AND IT IS THE COUNTDOWN ────────────────────────
                The race name was 40px and the days-to-start 60 — close enough
                that the eye had to choose between them, so the top of the page
                had two subjects and no answer. A plan screen is opened with one
                question underneath every other one: how long have I got. The
                name is what the plan is FOR; the number is what it is ABOUT.
                28 against 96 stops the argument. */}
            <span style={{ fontSize: 28, fontWeight: 600, letterSpacing: -0.9, lineHeight: 1.06, color: T.ink }}>{vm.eventName}</span>
            <span style={{ fontSize: 13, fontWeight: 600, color: T.mid }}>{vm.eventSub}</span>
          </div>
          <div style={{ display: 'flex', gap: 16, alignItems: 'flex-end', paddingTop: 4 }}>
            <span style={{ fontSize: 96, fontWeight: 600, letterSpacing: -4.6, lineHeight: 0.84, color: vm.daysToStart != null ? T.acid : T.quiet, textShadow: vm.daysToStart != null ? `0 0 34px ${T.acid}4D` : 'none' }}>{vm.daysToStart ?? DASH}</span>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, paddingBottom: 6 }}>
              <span style={{ fontSize: 15, fontWeight: 600, color: T.ink }}>Tage bis zum Start</span>
              <span style={{ fontSize: 12, fontWeight: 600, color: T.quiet }}>{vm.weeksDaysLabel} · {vm.planWeekLabel}</span>
            </div>
          </div>
        </div>

        {/* Phase rail */}
        <div style={{ ...band(20) }}>
          <PhaseRail phases={vm.phases} currentWeek={vm.planWeekNum} totalWeeks={vm.totalWeeks} />
        </div>

        {/* Ziel & Anforderungen link */}
        <div style={{ ...band(24) }}>
          <button onClick={onGoal} style={{ ...card(), flexDirection: 'row', alignItems: 'center', gap: 14, cursor: 'pointer', border: 0, fontFamily: FONT, textAlign: 'left' }}>
            <div style={{ width: 42, height: 42, borderRadius: 14, background: T.acidDim, display: 'grid', placeItems: 'center', flex: 'none' }}><Flag size={19} color={T.acid} /></div>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 3 }}>
              <span style={{ fontSize: 16, fontWeight: 600, color: T.ink }}>Ziel & Anforderungen</span>
              <span style={{ fontSize: 12, fontWeight: 600, color: T.quiet }}>{vm.reqSummary}</span>
            </div>
            <span style={{ fontSize: 12, fontWeight: 600, color: T.mid }}>{vm.daysRight}</span>
            <ChevronRight size={18} color={T.mid} />
          </button>
        </div>

        {/* Wo du gerade stehst */}
        <SectionTitle title="Wo du gerade stehst" right={<span style={{ fontSize: 12, fontWeight: 600, color: T.quiet }}>{vm.phaseOfTotal}</span>} />
        <div style={{ ...band(26) }}>
          {vm.block ? (
            <div style={{ ...card(), gap: 16, border: `1px solid ${T.stroke}` }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <Kicker>AKTIVER BLOCK</Kicker>
                    <span style={{ fontSize: 30, fontWeight: 600, letterSpacing: -0.8, color: T.ink }}>{vm.block.phase}</span>
                  </div>
                  <span style={{ fontSize: 12, fontWeight: 600, color: T.mid, paddingTop: 6 }}>{vm.block.dateRange}</span>
                </div>
                <div style={{ height: 6, borderRadius: 100, background: T.surface2, overflow: 'hidden' }}>
                  <motion.div initial={reduce ? false : { width: 0 }} animate={{ width: vm.block.restNote ? '50%' : '66%' }} transition={{ duration: 0.7, ease: EASE }}
                    style={{ height: '100%', borderRadius: 100, background: T.acid }} />
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 11, fontWeight: 600, color: T.ink }}>{vm.block.weekOfBlock}</span>
                  {vm.block.restNote && <span style={{ fontSize: 11, fontWeight: 600, color: T.quiet }}>{vm.block.restNote}</span>}
                </div>
              </div>
              <span style={{ fontSize: 13, fontWeight: 500, color: T.mid, lineHeight: 1.5 }}>{vm.block.text}</span>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {vm.block.tags.map((t) => (
                  <span key={t} style={{ padding: '6px 12px', borderRadius: 100, background: T.surface2, fontSize: 11, fontWeight: 600, color: T.mid }}>{t}</span>
                ))}
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '12px 14px', borderRadius: 14, background: T.surface2 }}>
                <ArrowRight size={14} color={T.acid} style={{ transform: 'rotate(45deg)' }} />
                <span style={{ fontSize: 12, fontWeight: 600, color: T.mid }}>{vm.block.next}</span>
              </div>
            </div>
          ) : (
            <div style={{ ...card(), alignItems: 'center' }}>
              <span style={{ fontSize: 22, fontWeight: 600, color: T.quiet }}>{DASH}</span>
            </div>
          )}
        </div>

        {/* Die 12 Wochen */}
        <SectionTitle title={`Die ${vm.weekBars.length || 12} Wochen`} right={<span style={{ fontSize: 13, fontWeight: 600, color: T.mid }}>Ø {vm.avgTss}</span>} />
        <div style={{ ...band(4), marginTop: -4 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: T.quiet, marginBottom: 12 }}>Belastung pro Woche in TSS</span>
        </div>
        <div style={{ ...band(26) }}>
          <div style={{ ...card() }}>
            {vm.weekBars.length > 0 ? <WeekChart bars={vm.weekBars} /> : <span style={{ fontSize: 20, fontWeight: 600, color: T.quiet, textAlign: 'center' }}>{DASH}</span>}
          </div>
        </div>

        {/* Diese Woche */}
        <SectionTitle title="Diese Woche" right={<span style={{ padding: '4px 10px', borderRadius: 100, background: T.acidDim, fontSize: 11, fontWeight: 600, color: T.acid }}>{vm.weekBadge}</span>} />
        <div style={{ ...band(26), gap: 16 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: T.quiet, marginTop: -4 }}>{vm.weekRangeLabel}</span>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            {vm.weekStats.map((s) => (
              <div key={s.label} style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                <span style={{ fontSize: 22, fontWeight: 600, letterSpacing: -0.6, color: s.value === '—' ? T.quiet : T.ink }}>{s.value}</span>
                <span style={{ fontSize: 10, fontWeight: 600, color: T.quiet }}>{s.label}</span>
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '10px 0' }}>
            <Repeat size={14} color={T.mid} />
            <span style={{ fontSize: 11.5, fontWeight: 600, color: T.quiet }}>Einheiten lassen sich halten und tauschen – der Plan rechnet die Woche neu.</span>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            {vm.dayStrip.map((d, i) => {
              const h = Math.max(6, Math.round((d.frac / stripMax) * 44))
              return (
                <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 10, fontWeight: 600, color: d.isToday ? T.acid : T.quiet }}>{d.letter}</span>
                  <span style={{ fontSize: 13, fontWeight: 600, color: d.isToday ? T.acid : T.ink }}>{d.date}</span>
                  <div style={{ width: '100%', height: 52, display: 'flex', alignItems: 'flex-end', borderRadius: 10, background: d.isToday ? T.acidDim : T.surface2, padding: 4 }}>
                    <div style={{ width: '100%', height: h, borderRadius: 5, background: d.isRest ? T.d2 : d.isToday ? T.acid : T.d3 }} />
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Today's session */}
        <div style={{ ...band(26) }}>
          <div style={{ ...card(), gap: 18 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Kicker>HEUTIGE EINHEIT</Kicker>
              <span style={{ fontSize: 11, fontWeight: 600, color: T.mid }}>{vm.sessionDur ?? DASH}</span>
            </div>
            <span style={{ fontSize: 30, fontWeight: 600, letterSpacing: -0.9, color: vm.sessionTitle ? T.ink : T.ink }}>{vm.sessionTitle ?? 'Ruhetag'}</span>
            {vm.sessionTitle ? (
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                {[[vm.targetW, 'ZIEL'], [vm.sessionTss, 'TSS'], [vm.ftpPct, 'DER FTP']].map(([v, l]) => (
                  <div key={l} style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                    <span style={{ fontSize: 22, fontWeight: 600, letterSpacing: -0.6, color: v === '—' ? T.quiet : T.ink }}>{v}</span>
                    <span style={{ fontSize: 10, fontWeight: 600, color: T.quiet }}>{l}</span>
                  </div>
                ))}
              </div>
            ) : (
              <span style={{ fontSize: 12.5, fontWeight: 500, lineHeight: 1.5, color: T.mid }}>Erholung ist heute eingeplant — 0 TSS. Der Coach füllt Trainingstage eine Woche im Voraus und passt jeden Morgen an.</span>
            )}
            {vm.sessionBars.length > 0 && <SessionBeam bars={vm.sessionBars} ftpTag={vm.ftpTag} />}

            {/* adapt row */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 9.5, fontWeight: 600, letterSpacing: 1, color: T.quiet }}>NICHT NACH DEM GEFÜHL?</span>
                <span style={{ fontSize: 9.5, fontWeight: 600, letterSpacing: 1, color: T.quiet }}>COACH RECHNET DIE WOCHE NEU</span>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <AdaptBtn label="Leichter" sub={vm.easierTss} icon={<ChevronDown size={13} color={T.mid} />} busy={adaptBusy === 'easier'} onClick={() => doAdapt('easier')} />
                <AdaptBtn label="Härter" sub={vm.harderTss} icon={<ChevronUp size={13} color={T.mid} />} busy={adaptBusy === 'harder'} onClick={() => doAdapt('harder')} />
                <AdaptBtn label="Tauschen" sub="3 Optionen" icon={<Repeat size={13} color={T.mid} />} busy={false} onClick={() => setSwapOpen((v) => !v)} active={swapOpen} />
              </div>
              {swapOpen && (
                <div style={{ display: 'flex', gap: 8 }}>
                  <AdaptBtn label="Kürzer" sub="45 min" icon={<Minus size={13} color={T.mid} />} busy={adaptBusy === 'shorter'} onClick={() => doAdapt('shorter')} />
                  <AdaptBtn label="Indoor" sub="Rolle" icon={<Repeat size={13} color={T.mid} />} busy={adaptBusy === 'indoor'} onClick={() => doAdapt('indoor')} />
                  <AdaptBtn label="Ruhetag" sub="frei" icon={<ChevronDown size={13} color={T.mid} />} busy={adaptBusy === 'rest'} onClick={() => doAdapt('rest')} />
                </div>
              )}
              {adaptMsg && <span style={{ fontSize: 11, fontWeight: 600, color: T.mid }}>{adaptMsg}</span>}
            </div>

            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <Zap size={13} color={T.acid} />
              <span style={{ fontSize: 11, fontWeight: 600, color: T.quiet }}>{vm.earnNote}</span>
            </div>
            {vm.sessionTitle && (
              <button onClick={onStartRide}
                style={{ height: 54, borderRadius: 100, background: T.acid, display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 8px 0 22px', border: 0, cursor: 'pointer', fontFamily: FONT, width: '100%' }}>
                <span style={{ fontSize: 16, fontWeight: 600, color: T.bg }}>Fahrt starten</span>
                <div style={{ width: 38, height: 38, borderRadius: 100, background: T.bg, display: 'grid', placeItems: 'center' }}><ArrowRight size={18} color={T.acid} /></div>
              </button>
            )}
          </div>
        </div>

        {/* Belastung & Prognose link */}
        <div style={{ ...band(26) }}>
          <button onClick={onLoad} style={{ ...card(), flexDirection: 'row', alignItems: 'center', gap: 14, cursor: 'pointer', border: 0, fontFamily: FONT, textAlign: 'left' }}>
            <div style={{ width: 42, height: 42, borderRadius: 14, background: T.acidDim, display: 'grid', placeItems: 'center', flex: 'none' }}><Activity size={19} color={T.acid} /></div>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 3 }}>
              <span style={{ fontSize: 16, fontWeight: 600, color: T.ink }}>Belastung & Prognose</span>
              <span style={{ fontSize: 12, fontWeight: 600, color: T.quiet }}>Zonenverteilung, Umsetzung und wo dich der Plan hinbringt</span>
            </div>
            <span style={{ fontSize: 12, fontWeight: 600, color: T.mid }}>{vm.forecastValue}</span>
            <ChevronRight size={18} color={T.mid} />
          </button>
        </div>

        {/* Wie der Plan sich anpasst */}
        <div style={{ ...band(26), gap: 12 }}>
          <span style={{ fontSize: 24, fontWeight: 600, letterSpacing: -0.6, color: T.ink }}>Wie der Plan sich anpasst</span>
          <span style={{ fontSize: 13, fontWeight: 500, color: T.mid, lineHeight: 1.5 }}>{vm.adaptExplainer}</span>
        </div>

        {/* CTAs */}
        <div style={{ ...band(40), gap: 10 }}>
          <button onClick={() => setSheet('adjust')}
            style={{ height: 56, borderRadius: 100, background: T.evening, display: 'flex', gap: 10, justifyContent: 'center', alignItems: 'center', border: 0, cursor: 'pointer', fontFamily: FONT }}>
            <SlidersHorizontal size={17} color={T.ink} /><span style={{ fontSize: 16, fontWeight: 600, color: T.ink }}>Plan anpassen</span>
          </button>
          <button onClick={() => setSheet('goal')}
            style={{ height: 50, borderRadius: 100, background: 'transparent', border: `1px solid ${T.stroke}`, display: 'flex', gap: 9, justifyContent: 'center', alignItems: 'center', cursor: 'pointer', fontFamily: FONT }}>
            <Repeat size={15} color={T.ink} /><span style={{ fontSize: 13.5, fontWeight: 600, color: T.ink }}>Ziel wechseln</span>
          </button>
        </div>

        {sheet === 'adjust' && <PlanAdjustSheet vm={vm} onClose={() => setSheet(null)} onRebuild={onRebuild} />}
        {sheet === 'goal' && <GoalSwitchSheet vm={vm} onClose={() => setSheet(null)} onSwitchGoal={onSwitchGoal} />}
      </div>
    </div>
  )
}

function AdaptBtn({ label, sub, icon, busy, onClick, active }: { label: string; sub: string; icon: ReactNode; busy: boolean; onClick: () => void; active?: boolean }) {
  return (
    <button onClick={onClick} disabled={busy}
      style={{ flex: 1, padding: '10px 0', borderRadius: 14, background: active ? T.acidDim : T.surface2, border: active ? `1px solid ${T.acid}` : 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, cursor: busy ? 'default' : 'pointer', fontFamily: FONT, opacity: busy ? 0.6 : 1 }}>
      <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>{icon}<span style={{ fontSize: 12.5, fontWeight: 600, color: T.ink }}>{busy ? '…' : label}</span></div>
      <span style={{ fontSize: 10, fontWeight: 600, color: active ? T.acid : T.quiet }}>{sub}</span>
    </button>
  )
}


/**
 * THE PLAN, AS THE ROOM'S BOTTOM PANEL.
 *
 * Plan was the one tab that built its own page — status bar, top bar, its own
 * scroll — while Today, Fahrten, Garage and Erfolge all share the hero room and
 * differ only in the panel docked under the machine. Moving between them, the
 * bike vanished and came back, which is the one thing the shared room exists to
 * prevent.
 *
 * WHAT GOES IN THE DOCK is the answer to "what am I training for", in the three
 * figures that answer it: how long until the day, where in the plan this week
 * sits, and which block is running. Everything else — the phases, the week, the
 * session — stays in the content below, because a dock that tried to hold the
 * whole plan would be the page again, three hundred pixels shorter.
 *
 * Deliberately the same shape as `W3WinsDock`: a row of figures with quiet
 * labels. Two panels in one room that were laid out differently would make the
 * room look like it was rebuilding itself on every tab, which is exactly the
 * impression the shared shell was built to remove.
 */
export function W3PlanDock({ vm }: { vm: W3PlanVm }) {
  const items: { key: string; value: string; unit?: string; label: string }[] = [
    {
      key: 'days',
      value: vm.daysToStart == null ? DASH : String(vm.daysToStart),
      unit: vm.daysToStart == null ? undefined : 'Tage',
      label: 'BIS ZUM START',
    },
    { key: 'week', value: String(vm.planWeekNum), unit: `/ ${vm.totalWeeks}`, label: 'PLANWOCHE' },
    { key: 'block', value: vm.block?.phase ?? DASH, label: 'BLOCK' },
  ]
  return (
    <div style={{ display: 'flex', width: '100%', justifyContent: 'space-between', gap: 10, padding: '0 4px' }}>
      {items.map((it) => (
        <div key={it.key} style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
          <div style={{ display: 'flex', gap: 4, alignItems: 'flex-end', minWidth: 0 }}>
            <span style={{
              fontSize: 26, fontWeight: 700, letterSpacing: -1, lineHeight: 1,
              color: it.value === DASH ? T.quiet : T.ink,
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
              ...TNUM,
            }}>{it.value}</span>
            {it.unit && <span style={{ fontSize: 10, fontWeight: 600, color: T.quiet, paddingBottom: 2, whiteSpace: 'nowrap' }}>{it.unit}</span>}
          </div>
          <span style={{ fontSize: 8.5, fontWeight: 700, letterSpacing: 1.1, color: T.quiet, whiteSpace: 'nowrap' }}>{it.label}</span>
        </div>
      ))}
    </div>
  )
}
