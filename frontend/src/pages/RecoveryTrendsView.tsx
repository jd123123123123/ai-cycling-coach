/**
 * RecoveryTrendsView — the multi-day TREND surfaces split off the Recovery tab.
 * A standalone route (/recovery/trends) reachable from the Recovery tab's
 * "Trends" toggle. A 7 / 14 / 31 / 90-day range selector drives every chart:
 *   • Recovery — daily readiness bars
 *   • Baseline Trends — HRV + Resting-HR history
 *   • Recovery vs Strain — day strain (from TSS) vs recovery capacity
 *   • Vitals Trends — respiration / SpO₂ / skin-temp (honest "—" where absent)
 * Everything is real-data + honest empty states — no fabricated numbers. It
 * fetches its own daily-metrics / activities for the selected window (≤365-day
 * API limit respected).
 */
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { subDays, format } from 'date-fns'
import { ArrowLeft, Heart, Activity, Wind } from 'lucide-react'
import { useDailyMetrics } from '../hooks/useDailyMetrics'
import { useActivitiesRange } from '../hooks/useActivitiesRange'
import { computeReadiness } from '../utils/metrics'
import { localDayKey } from '../utils/loadMetrics'
import HoverBars from '../components/ui/HoverBars'
import MobileBottomNav from '../components/dashboard/MobileBottomNav'
import { useLocale } from '../contexts/LocaleContext'

const DASH = '—'
const C = {
  paper: 'var(--color-paper)',
  paper2: 'var(--color-paper-2)',
  surface2: 'var(--color-surface-2)',
  surface3: 'var(--color-surface-3)',
  rule: 'var(--color-rule)',
  ink: 'var(--color-ink)',
  ink2: 'var(--color-ink-2)',
  muted: 'var(--color-muted)',
  accent: 'var(--color-accent)',
  recovery: 'var(--color-recovery)',
  strain: 'var(--color-strain)',
  amber: 'var(--color-amber)',
  move: 'var(--color-move)',
}
const soft = (v: string, pct = 15) => `color-mix(in srgb, ${v} ${pct}%, transparent)`
const cardStyle = { background: C.paper2, border: `1px solid ${C.rule}` } as const

const RANGES = [7, 14, 31, 90] as const
type Range = typeof RANGES[number]

function tierColor(score: number | null): string {
  if (score == null) return C.muted
  if (score >= 66) return C.recovery
  if (score >= 34) return C.amber
  return C.move
}
function avg(nums: number[]): number | null {
  const v = nums.filter((n) => typeof n === 'number' && !isNaN(n))
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null
}

function Card({ children, gap = 18 }: { children: React.ReactNode; gap?: number }) {
  return <div className="rounded-[24px] p-5 flex flex-col" style={{ ...cardStyle, gap }}>{children}</div>
}

export default function RecoveryTrendsView() {
  const navigate = useNavigate()
  const { locale } = useLocale()
  const de = locale === 'de'
  const [range, setRange] = useState<Range>(14)
  const today = useMemo(() => new Date(), [])
  const from = useMemo(() => subDays(today, range - 1), [today, range])

  const { data: metricsResp } = useDailyMetrics(from, today)
  const { data: acts } = useActivitiesRange(from, today)
  const metrics = metricsResp?.metrics ?? []

  const byDate = useMemo(() => {
    const m = new Map<string, typeof metrics[number]>()
    for (const x of metrics) { const k = (x.date ?? x.recorded_at ?? '').slice(0, 10); if (k) m.set(k, x) }
    return m
  }, [metrics])
  // Activities are bucketed by LOCAL calendar day (loadMetrics.localDayKey on
  // the started_at timestamp) so they line up with the `format(d,'yyyy-MM-dd')`
  // local day rows below — a UTC `.slice(0, 10)` put late-evening/early-morning
  // rides on the wrong strain day.
  const tssByDate = useMemo(() => {
    const m = new Map<string, number>()
    for (const a of acts?.activities ?? []) {
      const k = a.started_at ? localDayKey(a.started_at) : ''
      if (k) m.set(k, (m.get(k) ?? 0) + (a.tss ?? 0))
    }
    return m
  }, [acts])

  // One row per calendar day in the window.
  const days = useMemo(() => Array.from({ length: range }, (_, i) => {
    const d = subDays(today, range - 1 - i)
    const key = format(d, 'yyyy-MM-dd')
    const m = byDate.get(key) ?? null
    const readiness = m ? (m.training_readiness ?? computeReadiness(m.hrv_status ?? null, m.body_battery ?? null, m.sleep_score ?? null)) : null
    const tss = tssByDate.get(key) ?? 0
    const strain = tss > 0 ? Math.min(21, tss / 8) : 0
    return {
      key,
      dateLabel: format(d, de ? 'EEEE, d. MMM' : 'EEEE, MMM d'),
      isToday: i === range - 1,
      readiness,
      hrv: m?.hrv_status ?? null,
      rhr: m?.resting_hr ?? null,
      resp: m?.sleep_detail?.respiration_avg ?? null,
      spo2: m?.sleep_detail?.spo2_avg ?? null,
      strain,
      strainPct: (strain / 21) * 100,
      hasStrain: tss > 0,
    }
  }), [byDate, tssByDate, today, range, de])

  const recAvg = avg(days.map((d) => d.readiness).filter((v): v is number => v != null))
  const overDays = days.filter((d) => d.readiness != null && d.strainPct > d.readiness).length
  const balanced = overDays <= Math.ceil(range / 4)

  const rangeLabel = de ? `letzte ${range} Tage` : `last ${range} days`

  // Baseline row — normalized bar heights (20–100%) so the trend shape reads;
  // the tooltip carries the real value.
  const baselineRow = (label: string, sel: (d: typeof days[number]) => number | null, color: string, unit: string) => {
    const pts = days.map((d) => ({ v: sel(d), day: d.dateLabel, today: d.isToday })).filter((x): x is { v: number; day: string; today: boolean } => x.v != null)
    if (pts.length < 3) {
      return (
        <div className="flex flex-col gap-2">
          <span style={{ fontSize: 12, fontWeight: 600, color: C.ink2 }}>{label}</span>
          <span style={{ fontSize: 12, color: C.muted }}>{de ? 'Zu wenig Daten im Fenster' : 'Not enough data in this window'}</span>
        </div>
      )
    }
    const vals = pts.map((p) => p.v)
    const mx = Math.max(...vals), mn = Math.min(...vals), span = mx - mn || 1
    return (
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <span style={{ fontSize: 12, fontWeight: 600, color: C.ink2 }}>{label}</span>
          <span className="flex items-end gap-1"><span className="num-mono" style={{ fontSize: 16, fontWeight: 700, color }}>{Math.round(vals[vals.length - 1])}</span><span style={{ fontSize: 10, fontWeight: 500, color: C.muted, paddingBottom: 2 }}>{unit}</span></span>
        </div>
        <HoverBars
          height={72}
          gap={pts.length > 24 ? 2 : 4}
          defaultColor={color}
          bars={pts.map((p, i) => ({
            value: 20 + ((p.v - mn) / span) * 80,
            valueLabel: `${Math.round(p.v)} ${unit}`,
            label: p.day,
            color,
            highlight: i === pts.length - 1,
          }))}
        />
        <div className="flex justify-between"><span style={{ fontSize: 10, color: C.muted }}>{de ? `vor ${range} T` : `${range}d ago`}</span><span style={{ fontSize: 10, fontWeight: 600, color: C.accent }}>{de ? 'Heute' : 'Today'}</span></div>
      </div>
    )
  }

  // Recovery vs Strain — dual bars with a hover tooltip.
  const [balActive, setBalActive] = useState<number | null>(null)

  return (
    <div className="min-h-screen overflow-x-hidden" style={{ background: C.paper, color: C.ink }}>
      <div className="max-w-md mx-auto px-4 pb-28" style={{ paddingTop: 8 }}>
        <button onClick={() => navigate('/dashboard?tab=recovery')} className="flex items-center gap-2 mb-3"
          style={{ color: C.ink2, fontSize: 13, fontWeight: 600, background: 'none', border: 0, padding: '6px 0' }}>
          <ArrowLeft size={18} /> {de ? 'Erholung' : 'Recovery'}
        </button>

        <div className="flex flex-col" style={{ gap: 20 }}>
          {/* Header */}
          <div className="flex flex-col" style={{ gap: 2 }}>
            <span className="eyebrow" style={{ fontSize: 12, fontWeight: 600, letterSpacing: '0.08em', color: C.muted }}>{de ? 'ERHOLUNG · TRENDS' : 'RECOVERY · TRENDS'}</span>
            <span className="num-display" style={{ fontSize: 28, fontWeight: 700, color: C.ink }}>{de ? 'Trends' : 'Trends'}</span>
          </div>

          {/* Range selector */}
          <div className="flex rounded-full" style={{ gap: 3, padding: 4, background: C.surface2 }}>
            {RANGES.map((r) => (
              <button key={r} onClick={() => setRange(r)}
                className="flex-1 rounded-full" style={{
                  minHeight: 40, padding: '8px 4px', fontSize: 12, fontWeight: 600, border: 0,
                  background: range === r ? C.accent : 'transparent',
                  color: range === r ? C.ink : C.ink2,
                }}>
                {r}D
              </button>
            ))}
          </div>

          {/* Recovery bars */}
          <Card>
            <div className="flex items-center justify-between">
              <span className="num-display" style={{ fontSize: 16, color: C.ink }}>{de ? 'Erholung' : 'Recovery'}</span>
              {recAvg != null && <span className="inline-flex items-center rounded-full" style={{ padding: '5px 10px', background: soft(C.recovery, 15), fontSize: 12, fontWeight: 600, color: C.recovery }}>{Math.round(recAvg)}% {de ? 'Ø' : 'avg'}</span>}
            </div>
            <span style={{ fontSize: 12, color: C.muted }}>{de ? `Bereitschaft · ${rangeLabel}` : `Readiness · ${rangeLabel}`}</span>
            {days.some((d) => d.readiness != null) ? (
              <HoverBars
                height={150}
                gap={range > 24 ? 3 : 8}
                radius={range > 31 ? 3 : 6}
                bars={days.map((d) => ({
                  value: d.readiness ?? 0,
                  valueLabel: d.readiness != null ? `${Math.round(d.readiness)}%` : DASH,
                  label: d.dateLabel,
                  color: d.readiness != null ? tierColor(d.readiness) : C.surface3,
                  highlight: d.isToday,
                }))}
              />
            ) : (
              <span style={{ fontSize: 12, color: C.muted, padding: '20px 0' }}>{de ? 'Keine Erholungsdaten im Fenster' : 'No recovery data in this window'}</span>
            )}
          </Card>

          {/* Baseline Trends */}
          <Card>
            <span className="num-display" style={{ fontSize: 16, color: C.ink }}>{de ? `Basislinien-Trends · ${range} Tage` : `Baseline Trends · ${range} days`}</span>
            {baselineRow('HRV', (d) => d.hrv, C.recovery, 'ms')}
            {baselineRow(de ? 'Ruhepuls' : 'Resting HR', (d) => d.rhr, C.strain, 'bpm')}
          </Card>

          {/* Recovery vs Strain */}
          <Card gap={16}>
            <div className="flex items-end justify-between">
              <div className="flex flex-col" style={{ gap: 2 }}>
                <span className="num-display" style={{ fontSize: 16, color: C.ink }}>{de ? 'Erholung vs. Belastung' : 'Recovery vs Strain'}</span>
                <span style={{ fontSize: 12, color: C.muted }}>{de ? `${rangeLabel} · Balance` : `${rangeLabel} · balance`}</span>
              </div>
              <span className="flex items-center rounded-full" style={{ gap: 6, padding: '5px 10px', background: soft(balanced ? C.recovery : C.amber, 15) }}>
                <span style={{ width: 8, height: 8, borderRadius: 4, background: balanced ? C.recovery : C.amber }} />
                <span style={{ fontSize: 11, fontWeight: 600, color: balanced ? C.recovery : C.amber }}>{balanced ? (de ? 'Ausgewogen' : 'Balanced') : (de ? 'Überlastet' : 'Overreaching')}</span>
              </span>
            </div>
            <div className="relative select-none">
              {balActive != null && (() => {
                const c = days[balActive]
                return (
                  <div className="absolute z-20 pointer-events-none flex flex-col items-center" style={{ left: `${((balActive + 0.5) / days.length) * 100}%`, bottom: 120 + 8, transform: 'translateX(-50%)' }}>
                    <div className="rounded-[10px] px-2.5 py-1.5 flex flex-col items-center gap-0.5 whitespace-nowrap" style={{ background: C.surface3, border: `1px solid ${C.rule}`, boxShadow: '0 6px 18px rgba(0,0,0,0.45)' }}>
                      <span className="num-display" style={{ fontSize: 13, lineHeight: 1.2, color: C.strain }}>{c.hasStrain ? `${c.strain.toFixed(1)} ${de ? 'Belastung' : 'strain'}` : (de ? 'Ruhetag' : 'Rest day')}</span>
                      <span className="num-display" style={{ fontSize: 13, lineHeight: 1.2, color: C.recovery }}>{c.readiness != null ? `${Math.round(c.readiness)}% ${de ? 'Kapazität' : 'capacity'}` : (de ? 'keine Erholungsdaten' : 'no recovery data')}</span>
                      <span style={{ fontSize: 10.5, fontWeight: 600, color: C.muted }}>{c.dateLabel}</span>
                    </div>
                    <span style={{ width: 0, height: 0, borderLeft: '5px solid transparent', borderRight: '5px solid transparent', borderTop: `5px solid ${C.surface3}` }} />
                  </div>
                )
              })()}
              <div className="flex items-end justify-between" style={{ gap: range > 24 ? 2 : 6 }}>
                {days.map((c, i) => {
                  const over = c.readiness != null && c.strainPct > c.readiness
                  return (
                    <div
                      key={c.key}
                      className="flex-1 min-w-0"
                      style={{ position: 'relative', height: 120, cursor: 'pointer', outline: balActive === i ? '2px solid color-mix(in srgb, var(--color-ink) 25%, transparent)' : 'none', outlineOffset: 1, borderRadius: 8 }}
                      onPointerEnter={() => setBalActive(i)}
                      onPointerDown={() => setBalActive(i)}
                      onPointerLeave={() => setBalActive((cur) => (cur === i ? null : cur))}
                    >
                      <div style={{ position: 'absolute', inset: 0, borderRadius: 6, background: C.surface2 }} />
                      {c.readiness != null && <div style={{ position: 'absolute', left: 0, right: 0, bottom: `${(c.readiness / 100) * 120}px`, height: 3, borderRadius: 2, background: C.recovery }} />}
                      {c.readiness != null && <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: `${(c.readiness / 100) * 120}px`, borderRadius: 6, background: soft(C.recovery, 15) }} />}
                      {c.hasStrain && <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: `${Math.max(4, (c.strainPct / 100) * 120)}px`, borderRadius: 6, background: over ? C.amber : C.strain }} />}
                    </div>
                  )
                })}
              </div>
            </div>
            <div className="flex items-center flex-wrap gap-4">
              <div className="flex items-center gap-1.5"><span style={{ width: 12, height: 12, borderRadius: 4, background: C.strain }} /><span style={{ fontSize: 11, color: C.ink2 }}>{de ? 'Tagesbelastung' : 'Day strain'}</span></div>
              <div className="flex items-center gap-1.5"><span style={{ width: 14, height: 3, borderRadius: 2, background: C.recovery }} /><span style={{ fontSize: 11, color: C.ink2 }}>{de ? 'Erholungskapazität' : 'Recovery capacity'}</span></div>
              <div className="flex items-center gap-1.5"><span style={{ width: 12, height: 12, borderRadius: 4, background: C.amber }} /><span style={{ fontSize: 11, color: C.ink2 }}>{de ? 'Überlastung' : 'Overreach'}</span></div>
            </div>
          </Card>

          {/* Vitals Trends */}
          <Card>
            <div className="flex flex-col" style={{ gap: 2 }}>
              <span className="num-display" style={{ fontSize: 16, color: C.ink }}>{de ? 'Vitalwert-Trends' : 'Vitals Trends'}</span>
              <span style={{ fontSize: 12, color: C.muted }}>{de ? `${rangeLabel} · aus dem Schlaf` : `${rangeLabel} · from sleep`}</span>
            </div>
            {baselineRow(de ? 'Atemfrequenz' : 'Respiratory Rate', (d) => d.resp, C.recovery, 'br/min')}
            {baselineRow(de ? 'Ruhe-SpO₂' : 'Resting SpO₂', (d) => d.spo2, C.accent, '%')}
            {/* Skin temp: Garmin returns skinTempDataExists:false — honest empty. */}
            <div className="flex flex-col gap-2">
              <span style={{ fontSize: 12, fontWeight: 600, color: C.ink2 }}>{de ? 'Hauttemperatur' : 'Skin Temperature'}</span>
              <div className="grid place-items-center" style={{ height: 52, borderRadius: 8, background: C.surface2 }}>
                <span style={{ fontSize: 11, color: C.muted }}>{de ? 'Nicht erfasst' : 'Not tracked'}</span>
              </div>
            </div>
          </Card>

          {/* legend for readiness colors */}
          <div className="flex items-center flex-wrap gap-4 px-1">
            {[{ n: de ? 'Hoch' : 'High', c: C.recovery, i: Heart }, { n: de ? 'Mittel' : 'Moderate', c: C.amber, i: Activity }, { n: de ? 'Niedrig' : 'Low', c: C.move, i: Wind }].map((l) => (
              <div key={l.n} className="flex items-center gap-1.5"><span style={{ width: 12, height: 12, borderRadius: 4, background: l.c }} /><span style={{ fontSize: 12, color: C.ink2 }}>{l.n}</span></div>
            ))}
          </div>
        </div>
      </div>
      <MobileBottomNav />
    </div>
  )
}
