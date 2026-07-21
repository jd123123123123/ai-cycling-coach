import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  ArrowLeft, TrendingUp, TrendingDown, Zap, Check, ArrowRight, Moon, Bed,
} from 'lucide-react'
import { subDays, subMonths, startOfMonth, format } from 'date-fns'
import { useLocale } from '../contexts/LocaleContext'
import { usePMC } from '../hooks/usePMC'
import { useActivitiesRange } from '../hooks/useActivitiesRange'
import { usePeriodReport } from '../hooks/usePeriodReport'
import { useAdaptive } from '../hooks/useAdaptive'
import { useCurrentWeek } from '../hooks/useCurrentWeek'
import { latestLoad, localDayKey, classifyForm } from '../utils/loadMetrics'

/**
 * Load & Form — the standalone /load-form analysis screen. A 1:1 rebuild of the
 * V3 · Load & Form Pencil frame (BIXRn): Recommendation, This Week, Weekly Load,
 * Fitness & Freshness (CTL/ATL/TSB gauge — the pen's "load balance" gauge bound
 * to the ONE canonical CTL/ATL/TSB series, NOT a contested ACWR/injury number),
 * Load by Intensity and Monotony & Strain.
 *
 * Every figure is derived from real hooks (PMC entries + activities + period
 * report + athlete + adaptive directive + week plan). Where the backend can't
 * supply a figure we render the structure with a graceful "—" rather than
 * fabricate. Language guardrails: the words Verletzung / Gefahr / Untertraining
 * are never rendered (project science-methods avoid-list — the ACWR "injury
 * risk" framing from the mock is replaced by the fitness/fatigue/form story).
 */

const DASH = '—'

// ---- Header range control — FUNCTIONAL (a control that looks clickable but
// does nothing reads as a bug). The active range drives the activities-fetch
// window, the Weekly-Load bucketing (weeks vs months) and the eyebrow label,
// all from ONE source so the header can never contradict itself.
type RangeId = '6W' | '3M' | '1Y'
const RANGES: { id: RangeId; de: string; en: string; days: number; mode: 'week' | 'month'; count: number }[] = [
  { id: '6W', de: 'LETZTE 6 WOCHEN', en: 'LAST 6 WEEKS', days: 48, mode: 'week', count: 6 },
  { id: '3M', de: 'LETZTE 3 MONATE', en: 'LAST 3 MONTHS', days: 98, mode: 'week', count: 13 },
  { id: '1Y', de: 'LETZTE 12 MONATE', en: 'LAST 12 MONTHS', days: 372, mode: 'month', count: 12 },
]

function fmtDur(sec: number): string {
  const m = Math.round(sec / 60)
  const h = Math.floor(m / 60)
  const mm = m % 60
  return h > 0 ? `${h} h ${String(mm).padStart(2, '0')} m` : `${mm} m`
}

// Monday-anchored ISO-week key.
function isoWeekKey(d: Date): string {
  const day = (d.getDay() + 6) % 7
  const monday = new Date(d)
  monday.setDate(d.getDate() - day)
  return `${monday.getFullYear()}-${String(monday.getMonth() + 1).padStart(2, '0')}-${String(monday.getDate()).padStart(2, '0')}`
}

// ---- shared card shell ----------------------------------------------------

function Card({ children, gap = 16, accent = false }: { children: React.ReactNode; gap?: number; accent?: boolean }) {
  return (
    <div
      className="rounded-[24px] p-5"
      style={{
        display: 'flex', flexDirection: 'column', gap,
        background: accent ? 'var(--color-accent-soft)' : 'var(--color-paper-2)',
        border: `1px solid ${accent ? 'var(--color-accent)' : 'var(--color-rule)'}`,
      }}
    >
      {children}
    </div>
  )
}

function CardHead({ title, sub, right }: { title: string; sub?: string; right?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex flex-col gap-0.5 min-w-0">
        <span className="num-display" style={{ fontSize: 16, fontWeight: 600, color: 'var(--color-ink)' }}>{title}</span>
        {sub && <span style={{ fontSize: 12, color: 'var(--color-ink-2)' }}>{sub}</span>}
      </div>
      {right}
    </div>
  )
}

function Pill({ children, color, soft }: { children: React.ReactNode; color: string; soft?: string }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full"
      style={{ padding: '5px 10px', fontSize: 12, fontWeight: 700, color, background: soft ?? 'transparent' }}
    >
      {children}
    </span>
  )
}

// ===========================================================================

export default function LoadFormView() {
  const { locale } = useLocale()
  const de = locale === 'de'
  const navigate = useNavigate()
  const today = useMemo(() => new Date(), [])

  const [rangeId, setRangeId] = useState<RangeId>('6W')
  const range = RANGES.find((r) => r.id === rangeId)!

  const { data: pmc } = usePMC(90)
  const { data: actData } = useActivitiesRange(subDays(today, range.days), today)
  const { data: report } = usePeriodReport(90)
  const { data: adaptive } = useAdaptive()
  const { data: weekPlan } = useCurrentWeek()

  const series = pmc?.entries ?? []
  const activities = useMemo(() => actData?.activities ?? [], [actData])

  // ---- Canonical load numbers (P0-5: ONE producer; TSB == CTL − ATL) -------
  const load = latestLoad(series)
  const tsb = load?.tsb ?? null
  const ctl = load?.ctl ?? null
  const atl = load?.atl ?? null
  const dCtl7 = load?.dCtl7 ?? null

  const ld = report?.load_dynamics ?? null
  const rampWk = ld?.ramp_per_week ?? null

  // ---- TSB → form state (neutral tone; no banned words) --------------------
  const TSB_MIN = -30, TSB_MAX = 25
  const posTsb = (v: number) => Math.max(0, Math.min(1, (v - TSB_MIN) / (TSB_MAX - TSB_MIN)))
  const tsbState = classifyForm(tsb, de)
  const TSB_SEGS = [
    { color: 'var(--color-move)', to: -15 },
    { color: 'var(--color-amber)', to: -5 },
    { color: 'var(--color-recovery)', to: 10 },
    { color: 'var(--color-strain)', to: TSB_MAX },
  ]

  // ---- Load-over-time buckets (weekly for 6W/3M, monthly for 1Y) ----------
  const buckets = useMemo(() => {
    const out: { key: string; label: string; tss: number; inProgress: boolean }[] = []
    if (range.mode === 'week') {
      for (let i = range.count - 1; i >= 0; i--) {
        const monday = subDays(today, i * 7)
        out.push({ key: isoWeekKey(monday), label: format(monday, de ? 'd.M.' : 'M/d'), tss: 0, inProgress: i === 0 })
      }
      for (const a of activities) {
        const iso = a.started_at ?? a.date
        if (!iso) continue
        const b = out.find((x) => x.key === isoWeekKey(new Date(iso)))
        if (b) b.tss += a.tss ?? 0
      }
    } else {
      for (let i = range.count - 1; i >= 0; i--) {
        const m = startOfMonth(subMonths(today, i))
        out.push({ key: `${m.getFullYear()}-${m.getMonth()}`, label: format(m, 'LLL'), tss: 0, inProgress: i === 0 })
      }
      for (const a of activities) {
        const iso = a.started_at ?? a.date
        if (!iso) continue
        const d = new Date(iso)
        const b = out.find((x) => x.key === `${d.getFullYear()}-${d.getMonth()}`)
        if (b) b.tss += a.tss ?? 0
      }
    }
    return out.map((b) => ({ ...b, tss: Math.round(b.tss) }))
  }, [activities, today, range, de])
  const maxBucket = Math.max(1, ...buckets.map((b) => b.tss))

  // ---- Ramp badge — prefer backend load_dynamics; else week-over-week % ----
  const rampBadge = useMemo(() => {
    if (rampWk != null) {
      const high = ld?.flag === 'high' || ld?.flag === 'spike' || ld?.flag === 'ramp_high'
      return {
        text: `${rampWk >= 0 ? '+' : ''}${Math.round(rampWk)}${de ? '/Wo' : '/wk'}`,
        ok: !high,
        note: high ? (de ? 'zügig' : 'brisk') : (de ? 'sicher' : 'safe'),
      }
    }
    const done = buckets.filter((b) => !b.inProgress)
    const last = done[done.length - 1]
    const prior = done[done.length - 2]
    if (!last || !prior || prior.tss <= 0) return null
    const pct = Math.round(((last.tss - prior.tss) / prior.tss) * 100)
    return { text: `${pct >= 0 ? '+' : ''}${pct} %`, ok: pct <= 20, note: de ? 'ggü. Vorwoche' : 'vs prior' }
  }, [rampWk, ld, buckets, de])

  // ---- Intensity (3-zone model from period report) ------------------------
  const mix = report?.intensity ?? null
  const intensitySegs = mix ? [
    { key: 'easy', label: de ? 'Leicht' : 'Easy', pct: mix.z1_pct, color: 'var(--color-recovery)' },
    { key: 'mod', label: de ? 'Moderat' : 'Moderate', pct: mix.z2_pct, color: 'var(--color-amber)' },
    { key: 'hard', label: de ? 'Hart' : 'Hard', pct: mix.z3_pct, color: 'var(--color-move)' },
  ] : []

  // ---- Monotony & Strain — backend load_dynamics, else Foster fallback ----
  const foster = useMemo(() => {
    if (ld && (ld.monotony != null || ld.strain != null)) {
      return { monotony: ld.monotony, strain: ld.strain }
    }
    const dayLoads: number[] = []
    for (let i = 6; i >= 0; i--) {
      const key = localDayKey(subDays(today, i))
      dayLoads.push(activities.filter((a) => localDayKey(new Date(a.started_at ?? a.date ?? 0)) === key).reduce((s, a) => s + (a.tss ?? 0), 0))
    }
    const total = dayLoads.reduce((s, v) => s + v, 0)
    if (total <= 0) return null
    const mean = total / 7
    const sd = Math.sqrt(dayLoads.reduce((s, v) => s + (v - mean) ** 2, 0) / 7)
    const monotony = sd > 0 ? mean / sd : 0
    return { monotony, strain: total * monotony }
  }, [ld, activities, today])
  const monoOk = foster?.monotony != null && foster.monotony < 2

  // ---- This week — done vs planned ----------------------------------------
  const todayIdx = (today.getDay() + 6) % 7
  const thisWeek = useMemo(() => {
    const key = isoWeekKey(today)
    const inWeek = activities.filter((a) => isoWeekKey(new Date(a.started_at ?? a.date ?? 0)) === key)
    const tss = Math.round(inWeek.reduce((s, a) => s + (a.tss ?? 0), 0))
    const dayHas = Array.from({ length: 7 }, (_, i) => {
      const d = subDays(today, todayIdx - i)
      return inWeek.some((a) => localDayKey(new Date(a.started_at ?? a.date ?? 0)) === localDayKey(d))
    })
    return { tss, sessions: inWeek.length, dayHas }
  }, [activities, today, todayIdx])
  const weekdayLetters = de ? ['M', 'D', 'M', 'D', 'F', 'S', 'S'] : ['M', 'T', 'W', 'T', 'F', 'S', 'S']

  const days = weekPlan?.days ?? []
  const plannedSessions = days.filter((d) => d.category !== 'rest').length || null
  const plannedWeekTss = weekPlan?.planned_tss_total ?? null
  const tssLeft = plannedWeekTss != null ? Math.max(0, Math.round(plannedWeekTss - thisWeek.tss)) : null
  const compliancePct = plannedWeekTss != null && plannedWeekTss > 0
    ? Math.round((thisWeek.tss / plannedWeekTss) * 100) : null
  const weekElapsedFrac = (todayIdx + 1) / 7
  const complianceOnPace = compliancePct != null && compliancePct >= weekElapsedFrac * 100
  const complianceColor = complianceOnPace ? 'var(--color-recovery)' : 'var(--color-muted)'

  // ---- Recommendation — mirrors the ONE Daily Decision (P0-3) --------------
  const decision = adaptive?.daily_decision ?? null
  const dState = decision?.state ?? null
  const restLike = dState === 'planned_rest' || dState === 'sick' || dState === 'injured' || dState === 'break'
  const recHeadline = dState === 'planned_rest'
    ? (de ? 'Grünes Licht für morgen' : 'Green light for tomorrow')
    : adaptive?.headline ?? (de ? 'Grünes Licht zum Trainieren' : 'Green light to train')
  const recBody = decision?.reason ?? adaptive?.signals?.[0]?.text ?? adaptive?.intensity_ceiling ?? null
  const todayPlan = days.find((d) => d.is_today) ?? null
  const showSession = !restLike && todayPlan != null && todayPlan.category !== 'rest'
  const recCta = restLike
    ? { to: '/dashboard?tab=recovery', label: de ? 'Erholung ansehen' : 'View recovery' }
    : dState === 'trained_already'
      ? { to: '/dashboard?tab=today', label: de ? 'Einheit ansehen' : 'View session' }
      : { to: '/dashboard?tab=today', label: de ? 'Einheit öffnen' : 'Open session' }
  const RecIcon = restLike ? Moon : Check

  const showTrend = (v: number | null, unit = '') =>
    v == null ? DASH : `${v >= 0 ? '+' : ''}${v}${unit}`

  return (
    <div className="min-h-screen" style={{ background: 'var(--color-paper)' }}>
      <div className="mx-auto w-full max-w-md px-4 pt-3 pb-28 flex flex-col gap-5">
        {/* Back */}
        <button
          onClick={() => navigate(-1)}
          className="inline-flex items-center gap-1.5 self-start rounded-full px-3 py-1.5"
          style={{ fontSize: 12.5, color: 'var(--color-ink-2)', border: '1px solid var(--color-rule)', background: 'transparent' }}
        >
          <ArrowLeft size={15} /> {de ? 'Zurück' : 'Back'}
        </button>

        {/* Header + FUNCTIONAL range toggle */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex flex-col gap-0.5">
            <span className="eyebrow" style={{ fontSize: 12, letterSpacing: 1, fontWeight: 600, color: 'var(--color-muted)' }}>
              {de ? range.de : range.en}
            </span>
            <span className="num-display" style={{ fontSize: 28, fontWeight: 700, color: 'var(--color-ink)' }}>
              {de ? 'Belastung & Form' : 'Load & Form'}
            </span>
          </div>
          <div className="flex rounded-full p-[3px]" style={{ background: 'var(--color-surface-2)', gap: 2 }}>
            {RANGES.map((r) => (
              <button
                key={r.id}
                onClick={() => setRangeId(r.id)}
                className="rounded-full"
                style={{
                  padding: '6px 12px', fontSize: 12, fontWeight: 600, border: 'none', cursor: 'pointer',
                  color: r.id === rangeId ? 'var(--color-ink)' : 'var(--color-ink-2)',
                  background: r.id === rangeId ? 'var(--color-accent)' : 'transparent',
                }}
              >
                {r.id}
              </button>
            ))}
          </div>
        </div>

        {/* 1. Recommendation — mirrors the daily decision (single source) */}
        <Card accent>
          <div className="flex items-center gap-3">
            <span className="flex items-center justify-center rounded-full" style={{ width: 40, height: 40, background: 'var(--color-accent)', color: 'var(--color-ink)' }}>
              <RecIcon size={22} />
            </span>
            <div className="flex flex-col gap-0.5 min-w-0">
              <span className="num-display" style={{ fontSize: 18, fontWeight: 700, color: 'var(--color-ink)' }}>{recHeadline}</span>
              <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--color-accent)' }}>{decision?.verdict ?? (de ? 'Heutige Empfehlung' : "Today's recommendation")}</span>
            </div>
          </div>
          {recBody && (
            <p style={{ fontSize: 13, lineHeight: 1.45, color: 'var(--color-ink-2)' }}>{recBody}</p>
          )}
          {showSession && todayPlan && (
            <div
              className="flex items-center justify-between rounded-[16px]"
              style={{ padding: 14, background: 'rgba(10,12,15,0.7)', border: '1px solid color-mix(in srgb, var(--color-accent) 20%, transparent)' }}
            >
              <div className="flex flex-col gap-0.5 min-w-0">
                <span className="num-display" style={{ fontSize: 15, fontWeight: 700, color: 'var(--color-ink)' }}>{todayPlan.title}</span>
                <span style={{ fontSize: 12, color: 'var(--color-ink-2)' }}>
                  {todayPlan.duration_seconds_target ? fmtDur(todayPlan.duration_seconds_target) : (de ? 'Einheit' : 'Session')}
                </span>
              </div>
              <div className="flex flex-col items-end gap-0.5">
                <span className="num-display" style={{ fontSize: 20, fontWeight: 700, color: 'var(--color-accent)' }}>{todayPlan.target_tss != null ? Math.round(todayPlan.target_tss) : DASH}</span>
                <span className="eyebrow" style={{ fontSize: 10, letterSpacing: 1, fontWeight: 600, color: 'var(--color-muted)' }}>{de ? 'ZIEL TSS' : 'TARGET TSS'}</span>
              </div>
            </div>
          )}
          <Link
            to={recCta.to}
            className="flex items-center justify-center gap-2 rounded-full"
            style={{ padding: 15, background: 'var(--color-accent)', color: 'var(--color-ink)', fontSize: 15, fontWeight: 700 }}
          >
            <span className="num-display" style={{ fontWeight: 700 }}>{recCta.label}</span>
            <ArrowRight size={18} />
          </Link>
        </Card>

        {/* 2. This Week — done vs planned */}
        <Card>
          <CardHead
            title={de ? 'Diese Woche' : 'This Week'}
            sub={plannedSessions != null
              ? (de ? `${thisWeek.sessions} von ${plannedSessions} Einheiten erledigt` : `${thisWeek.sessions} of ${plannedSessions} sessions done`)
              : (de ? `${thisWeek.sessions} Einheiten erledigt` : `${thisWeek.sessions} sessions done`)}
            right={compliancePct != null ? (
              <div className="flex items-end gap-0.5">
                <span className="num-display" style={{ fontSize: 34, fontWeight: 700, lineHeight: 1, color: complianceColor }}>{compliancePct}</span>
                <span style={{ fontSize: 13, fontWeight: 600, color: complianceColor, paddingBottom: 4 }}>%</span>
              </div>
            ) : undefined}
          />
          {compliancePct != null ? (
            <div style={{ height: 10, borderRadius: 5, background: 'var(--color-surface-3)', overflow: 'hidden' }}>
              <div style={{ width: `${Math.min(100, Math.max(0, compliancePct))}%`, height: '100%', borderRadius: 5, background: complianceOnPace ? 'var(--color-recovery)' : 'color-mix(in srgb, var(--color-muted) 55%, transparent)' }} />
            </div>
          ) : (
            <span style={{ fontSize: 12, color: 'var(--color-muted)' }}>{de ? 'Noch keine Plandaten diese Woche' : 'No plan data yet this week'}</span>
          )}
          <div className="flex justify-between">
            {[
              { v: plannedWeekTss != null ? `${thisWeek.tss} / ${Math.round(plannedWeekTss)}` : `${thisWeek.tss}`, l: de ? 'TSS erledigt' : 'TSS done' },
              { v: plannedSessions != null ? `${thisWeek.sessions} / ${plannedSessions}` : `${thisWeek.sessions}`, l: de ? 'Einheiten' : 'Sessions' },
              { v: tssLeft != null ? `${tssLeft}` : DASH, l: de ? 'TSS übrig' : 'TSS left' },
            ].map((s) => (
              <div key={s.l} className="flex flex-col gap-0.5">
                <span className="num-display" style={{ fontSize: 16, fontWeight: 700, color: 'var(--color-ink)' }}>{s.v}</span>
                <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--color-muted)' }}>{s.l}</span>
              </div>
            ))}
          </div>
          <div className="flex items-center justify-between">
            {thisWeek.dayHas.map((has, i) => (
              <div key={i} className="flex flex-col items-center gap-1.5">
                <span
                  className="flex items-center justify-center rounded-full"
                  style={{
                    width: 30, height: 30,
                    background: has ? 'var(--color-recovery)' : i === todayIdx ? 'var(--color-accent-soft)' : 'var(--color-surface-2)',
                    border: i === todayIdx ? '2px solid var(--color-accent)' : '1px solid var(--color-rule)',
                    color: has ? '#fff' : i === todayIdx ? 'var(--color-accent)' : 'var(--color-muted)',
                  }}
                >
                  {has ? <Check size={15} /> : i === todayIdx ? <Zap size={14} /> : <Bed size={13} />}
                </span>
                <span style={{ fontSize: 11, fontWeight: 600, color: i === todayIdx ? 'var(--color-accent)' : 'var(--color-muted)' }}>{weekdayLetters[i]}</span>
              </div>
            ))}
          </div>
        </Card>

        {/* 3. Weekly Load — the load story over the selected range */}
        <Card>
          <CardHead
            title={de ? 'Wöchentliche Last' : 'Weekly Load'}
            sub={ld?.note || (de ? 'Trainingsstress pro Zeitraum' : 'Training stress per period')}
            right={rampBadge ? (
              <Pill color={rampBadge.ok ? 'var(--color-recovery)' : 'var(--color-amber)'} soft={rampBadge.ok ? 'var(--color-recovery-soft, rgba(22,224,138,0.15))' : 'rgba(255,176,32,0.15)'}>
                {rampBadge.ok ? <Check size={13} /> : <TrendingUp size={13} />} {rampBadge.text} {rampBadge.note}
              </Pill>
            ) : undefined}
          />
          <div className="flex items-end" style={{ gap: 8, height: 130 }}>
            {buckets.map((b) => (
              <div key={b.key} className="flex-1 flex flex-col justify-end" style={{ height: '100%' }}>
                <div
                  title={`${b.label} · ${b.tss} TSS`}
                  style={{
                    height: Math.max(6, Math.round((b.tss / maxBucket) * 118)),
                    borderRadius: 6,
                    background: b.inProgress ? 'var(--color-ink)' : 'var(--color-strain)',
                  }}
                />
              </div>
            ))}
          </div>
          <div className="flex" style={{ gap: 8 }}>
            {buckets.map((b) => (
              <span key={b.key} className="flex-1 text-center" style={{ fontSize: 11, fontWeight: b.inProgress ? 700 : 500, color: b.inProgress ? 'var(--color-ink)' : 'var(--color-muted)' }}>
                {b.inProgress ? (de ? 'Jetzt' : 'Now') : b.label}
              </span>
            ))}
          </div>
          {ctl != null && tsb != null && (
            <span style={{ fontSize: 13, fontWeight: 500, lineHeight: 1.4, color: 'var(--color-ink-2)' }}>
              {de
                ? `Klartext: ${dCtl7 != null && dCtl7 >= 0 ? 'die Fitness steigt' : 'die Fitness konsolidiert'}, während die Frische ${tsb >= 0 ? 'positiv bleibt' : 'noch im Minus ist'} — ${tsb >= -5 ? 'du kannst die geplante Last aufnehmen.' : 'gönn dir zuerst etwas Erholung.'}`
                : `In plain words: ${dCtl7 != null && dCtl7 >= 0 ? 'fitness is climbing' : 'fitness is consolidating'} while freshness stays ${tsb >= 0 ? 'positive' : 'negative'} — ${tsb >= -5 ? "you can absorb this week's plan." : 'take some recovery first.'}`}
            </span>
          )}
        </Card>

        {/* 4. Fitness & Freshness — the pen's gauge, bound to CTL/ATL/TSB */}
        <Card>
          <div className="flex items-start justify-between gap-3">
            <div className="flex flex-col gap-0.5 min-w-0">
              <span className="num-display" style={{ fontSize: 16, fontWeight: 600, color: 'var(--color-ink)' }}>{de ? 'Fitness & Frische' : 'Fitness & Freshness'}</span>
              <span style={{ fontSize: 12, color: 'var(--color-ink-2)' }}>{tsbState.sub}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="num-display" style={{ fontSize: 26, fontWeight: 700, color: tsbState.color }}>{tsb == null ? DASH : showTrend(tsb)}</span>
              <Pill color={tsbState.color} soft={`color-mix(in srgb, ${tsbState.color} 15%, transparent)`}>{tsbState.label}</Pill>
            </div>
          </div>

          {/* Gauge */}
          <div>
            <div className="relative" style={{ height: 26 }}>
              <div className="absolute flex overflow-hidden" style={{ top: 8, left: 0, right: 0, height: 10, borderRadius: 5, gap: 2 }}>
                {TSB_SEGS.map((s, i) => {
                  const from = i === 0 ? TSB_MIN : TSB_SEGS[i - 1].to
                  const w = (posTsb(s.to) - posTsb(from)) * 100
                  return <div key={i} style={{ width: `${w}%`, height: '100%', background: s.color }} />
                })}
              </div>
              {tsb != null && (
                <div className="absolute" style={{ top: 0, left: `calc(${posTsb(tsb) * 100}% - 3px)`, width: 6, height: 26, borderRadius: 3, background: 'var(--color-ink)', border: '2px solid var(--color-paper-2)' }} />
              )}
            </div>
            <div className="flex justify-between" style={{ marginTop: 4 }}>
              <span style={{ fontSize: 11, color: 'var(--color-muted)' }}>{de ? 'Überlastet' : 'Overreached'}</span>
              <span style={{ fontSize: 11, color: 'var(--color-recovery)' }}>{de ? 'Optimal' : 'Sweet spot'}</span>
              <span style={{ fontSize: 11, color: 'var(--color-strain)' }}>{de ? 'Frisch' : 'Fresh'}</span>
            </div>
          </div>

          <div style={{ height: 1, background: 'var(--color-rule)' }} />

          {/* CTL / ATL / Ramp */}
          <div className="flex justify-between">
            {[
              {
                label: de ? 'FITNESS · CTL' : 'FITNESS · CTL', value: ctl ?? DASH,
                chip: dCtl7 != null ? { text: `${showTrend(dCtl7)} ${de ? 'Wo' : 'wk'}`, color: dCtl7 < 0 ? 'var(--color-muted)' : 'var(--color-strain)', Icon: dCtl7 < 0 ? TrendingDown : TrendingUp } : null,
              },
              {
                label: de ? 'ERMÜDUNG · ATL' : 'FATIGUE · ATL', value: atl ?? DASH,
                chip: atl != null ? { text: de ? 'akut' : 'acute', color: 'var(--color-amber)', Icon: Zap } : null,
              },
              {
                label: de ? 'AUFBAU/WO' : 'RAMP/WK', value: rampWk != null ? showTrend(Math.round(rampWk)) : DASH,
                chip: null as { text: string; color: string; Icon: typeof Zap } | null,
              },
            ].map((c) => (
              <div key={c.label} className="flex flex-col gap-1">
                <span className="eyebrow" style={{ fontSize: 10.5, letterSpacing: 0.8, color: 'var(--color-muted)' }}>{c.label}</span>
                <div className="flex items-center gap-1.5">
                  <span className="num-display" style={{ fontSize: 22, fontWeight: 700, color: 'var(--color-ink)' }}>{c.value}</span>
                  {c.chip && (
                    <span className="inline-flex items-center gap-0.5 rounded-full" style={{ padding: '2px 6px', background: 'var(--color-surface-2)', fontSize: 10, fontWeight: 600, color: c.chip.color }}>
                      <c.chip.Icon size={11} /> {c.chip.text}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
          {ctl != null && atl != null && tsb != null && (
            <span style={{ fontSize: 12.5, fontWeight: 500, lineHeight: 1.4, color: 'var(--color-ink-2)' }}>
              {de
                ? `Form = Fitness − Ermüdung: ${ctl} − ${atl} = ${showTrend(tsb)}. ${tsb >= -5 ? 'Ein ausgewogenes Verhältnis.' : 'Die Ermüdung führt gerade — plane Erholung ein.'}`
                : `Form = fitness − fatigue: ${ctl} − ${atl} = ${showTrend(tsb)}. ${tsb >= -5 ? 'A balanced ratio.' : 'Fatigue leads right now — plan recovery.'}`}
            </span>
          )}
        </Card>

        {/* 5. Load by Intensity — the 3-zone model actually available */}
        <Card>
          <CardHead
            title={de ? 'Last nach Intensität' : 'Load by Intensity'}
            sub={mix ? `${mix.model}${mix.model && mix.target_model ? ` · ${de ? 'Ziel ' : 'target '}${mix.target_model}` : ''}` : (de ? 'Woraus dein Stress kam' : 'Where your stress came from')}
            right={mix ? (
              <Pill color={mix.aligned ? 'var(--color-recovery)' : 'var(--color-amber)'} soft={mix.aligned ? 'rgba(22,224,138,0.15)' : 'rgba(255,176,32,0.15)'}>
                <Check size={13} /> {mix.aligned ? (de ? 'Ausgerichtet' : 'On-target') : (de ? 'Daneben' : 'Off-target')}
              </Pill>
            ) : undefined}
          />
          {mix ? (
            <>
              <div className="flex overflow-hidden" style={{ height: 16, borderRadius: 8, gap: 2 }}>
                {intensitySegs.map((s) => (
                  <div key={s.key} title={`${s.label} · ${Math.round(s.pct)}%`} style={{ width: `${Math.max(0, s.pct)}%`, minWidth: s.pct > 0 ? 4 : 0, background: s.color }} />
                ))}
              </div>
              <div className="flex flex-col gap-2.5">
                {intensitySegs.map((s) => (
                  <div key={s.key} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span style={{ width: 9, height: 9, borderRadius: '50%', background: s.color }} />
                      <span style={{ fontSize: 13, color: 'var(--color-ink)' }}>{s.label}</span>
                    </div>
                    <span className="num-mono" style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-ink-2)' }}>{Math.round(s.pct)}%</span>
                  </div>
                ))}
              </div>
              {mix.fix && (
                <span style={{ fontSize: 12.5, fontWeight: 500, lineHeight: 1.4, color: 'var(--color-ink-2)' }}>{mix.fix}</span>
              )}
            </>
          ) : (
            <span style={{ fontSize: 13, color: 'var(--color-muted)' }}>{de ? 'Noch keine Intensitätsdaten' : 'No intensity data yet'}</span>
          )}
        </Card>

        {/* 6. Monotony & Strain */}
        <Card>
          <div className="flex flex-col gap-0.5">
            <span className="num-display" style={{ fontSize: 16, fontWeight: 600, color: 'var(--color-ink)' }}>{de ? 'Monotonie & Strain' : 'Monotony & Strain'}</span>
            <span style={{ fontSize: 12, color: 'var(--color-ink-2)' }}>{de ? 'Genug Abwechslung schützt vor Überlastung' : 'Enough day-to-day variety guards against overload'}</span>
          </div>
          {[
            {
              label: de ? 'Monotonie' : 'Monotony',
              value: foster?.monotony != null ? foster.monotony.toFixed(1) : DASH,
              fill: foster?.monotony != null ? foster.monotony / 3 : 0,
              color: monoOk ? 'var(--color-recovery)' : 'var(--color-amber)',
              badge: foster?.monotony != null ? (monoOk ? (de ? 'Gut' : 'Good') : (de ? 'Hoch' : 'High')) : DASH,
              badgeColor: monoOk ? 'var(--color-recovery)' : 'var(--color-amber)',
              note: de ? 'Ziel < 2,0 · variierte Last' : 'Target < 2.0 · varied load',
            },
            {
              label: de ? 'Wochen-Strain' : 'Weekly Strain',
              value: foster?.strain != null ? Math.round(foster.strain).toLocaleString(de ? 'de-DE' : 'en-US') : DASH,
              fill: foster?.strain != null ? foster.strain / 4000 : 0,
              color: 'var(--color-strain)',
              badge: foster?.strain != null ? (foster.strain < 2500 ? (de ? 'Moderat' : 'Moderate') : (de ? 'Hoch' : 'High')) : DASH,
              badgeColor: foster?.strain != null && foster.strain < 2500 ? 'var(--color-recovery)' : 'var(--color-amber)',
              note: de ? 'Last × Monotonie' : 'Load × monotony',
            },
          ].map((r) => (
            <div key={r.label} className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <div className="flex items-end gap-2">
                  <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-ink-2)' }}>{r.label}</span>
                  <span className="num-display" style={{ fontSize: 20, fontWeight: 700, color: 'var(--color-ink)' }}>{r.value}</span>
                </div>
                <span className="rounded-full" style={{ padding: '4px 9px', background: 'var(--color-paper)', fontSize: 11, fontWeight: 700, color: r.badgeColor }}>{r.badge}</span>
              </div>
              <div style={{ height: 6, borderRadius: 3, background: 'var(--color-surface-3)', overflow: 'hidden' }}>
                <div style={{ width: `${Math.max(0, Math.min(100, r.fill * 100))}%`, height: '100%', borderRadius: 3, background: r.color }} />
              </div>
              <span style={{ fontSize: 11, color: 'var(--color-muted)' }}>{r.note}</span>
            </div>
          ))}
        </Card>
      </div>
    </div>
  )
}
