/**
 * RecoveryTab — rebuilt 1:1 from the Pencil "Screen · Recovery" Content frame.
 * Card order matches the .pen exactly (16 cards). Where Garmin's daily feed
 * can't back a card (SpO₂, skin-temp, respiration, sleep stages/duration, bed
 * times, behavior journal) we keep the card STRUCTURE and render a graceful
 * "—" / short note instead of fabricating values.
 */
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { subDays, format, parseISO } from 'date-fns'
import {
  Activity, Heart, Wind, Droplet, Thermometer, Moon, Zap, Sunset,
  ChevronRight, LineChart, type LucideIcon,
} from 'lucide-react'
import { useDailyMetrics } from '../../../hooks/useDailyMetrics'
import { useActivitiesRange } from '../../../hooks/useActivitiesRange'
import { useTodaySnapshot } from '../../../hooks/useTodaySnapshot'
import { computeReadiness, readinessTier } from '../../../utils/metrics'
import ScoreRing from '../../ui/ScoreRing'
import MetricCard from '../../ui/MetricCard'
import { BottomSheet } from '../../strength/BottomSheet'
import { useLocale } from '../../../contexts/LocaleContext'

const cardStyle = { background: 'var(--color-paper-2)', border: '1px solid var(--color-rule)' } as const
const DASH = '—'

// h:mm from seconds (e.g. 27000 → "7:30"). Null/zero → DASH.
function fmtHm(sec: number | null | undefined): string {
  if (sec == null || sec <= 0) return DASH
  const h = Math.floor(sec / 3600)
  const m = Math.round((sec % 3600) / 60)
  return `${h}:${String(m).padStart(2, '0')}`
}

function tierColor(score: number | null): string {
  if (score == null) return 'var(--color-muted)'
  if (score >= 66) return 'var(--color-recovery)'
  if (score >= 34) return 'var(--color-amber)'
  return 'var(--color-move)'
}

function avg(nums: number[]): number | null {
  const v = nums.filter((n) => typeof n === 'number' && !isNaN(n))
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n))
}

// One "Recovery Driver" row: icon chip + label on the left, value + delta pill
// on the right, and a bipolar bar (center tick, colored segment deviating
// left/right of baseline). `dev` is a signed −1..1 fraction; null = no signal.
function Driver({
  icon: Icon, label, value, delta, deltaColor, dev, segColor,
}: {
  icon: LucideIcon; label: string; value: string
  delta: string | null; deltaColor: string
  dev: number | null; segColor: string
}) {
  return (
    <div className="flex flex-col" style={{ gap: 7 }}>
      <div className="flex items-center justify-between">
        <div className="flex items-center" style={{ gap: 9 }}>
          <span className="grid place-items-center" style={{ width: 24, height: 24, borderRadius: 7, background: 'var(--color-surface-2)' }}>
            <Icon size={14} strokeWidth={2.2} style={{ color: segColor }} />
          </span>
          <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--color-ink)' }}>{label}</span>
        </div>
        <div className="flex items-center" style={{ gap: 8 }}>
          <span className="num-mono" style={{ fontSize: 14, fontWeight: 700, color: 'var(--color-ink-2)' }}>{value}</span>
          {delta && (
            <span className="num-mono" style={{ fontSize: 10, fontWeight: 600, color: deltaColor, background: 'var(--color-paper)', borderRadius: 999, padding: '2px 7px' }}>{delta}</span>
          )}
        </div>
      </div>
      <div style={{ position: 'relative', height: 8 }}>
        <div style={{ position: 'absolute', top: 3, left: 0, right: 0, height: 2, borderRadius: 1, background: 'var(--color-surface-3)' }} />
        <div style={{ position: 'absolute', top: 0, left: 'calc(50% - 1px)', width: 2, height: 8, borderRadius: 1, background: 'var(--color-muted)' }} />
        {dev != null && (
          <div style={{ position: 'absolute', top: 2, height: 4, borderRadius: 2, background: segColor, ...(dev >= 0 ? { left: '50%', width: `${dev * 45}%` } : { right: '50%', width: `${-dev * 45}%` }) }} />
        )}
      </div>
    </div>
  )
}

export default function RecoveryTab() {
  const { locale } = useLocale()
  const de = locale === 'de'
  const [calSheet, setCalSheet] = useState<string | null>(null)
  const today = useMemo(() => new Date(), [])
  const { data: metricsResp } = useDailyMetrics(useMemo(() => subDays(today, 30), [today]), today)
  const { data: acts } = useActivitiesRange(useMemo(() => subDays(today, 7), [today]), today)
  const { data: snapshot } = useTodaySnapshot()

  const metrics = metricsResp?.metrics ?? []
  const byDate = useMemo(() => {
    const m = new Map<string, typeof metrics[number]>()
    for (const x of metrics) { const k = (x.date ?? x.recorded_at ?? '').slice(0, 10); if (k) m.set(k, x) }
    return m
  }, [metrics])
  const latest = [...metrics].reverse().find((m) => m.hrv_status != null || m.resting_hr != null || m.sleep_score != null) ?? null

  // Latest night with a real Garmin sleep-stage payload (SpO₂ / respiration / stages).
  const sd = ([...metrics].reverse().find((m) => m.sleep_detail != null)?.sleep_detail) ?? null
  const sleepStages = sd ? [
    { n: 'Deep', de: 'Tief', c: 'var(--color-strain)', s: sd.deep_s },
    { n: 'Light', de: 'Leicht', c: 'var(--color-stand)', s: sd.light_s },
    { n: 'REM', de: 'REM', c: 'var(--color-recovery)', s: sd.rem_s },
    { n: 'Awake', de: 'Wach', c: 'var(--color-muted)', s: sd.awake_s },
  ] : []
  const stageSum = sleepStages.reduce((a, x) => a + (x.s ?? 0), 0)
  const timeInBed = sd?.total_s != null ? sd.total_s + (sd.awake_s ?? 0) : null
  const efficiency = sd?.total_s != null && timeInBed ? Math.round((sd.total_s / timeInBed) * 100) : null

  const score = snapshot?.training_readiness
    ?? computeReadiness(latest?.hrv_status ?? null, latest?.body_battery ?? null, latest?.sleep_score ?? null)
  const rColor = tierColor(score ?? null)
  const tier = readinessTier(score ?? null)
  const scoreTxt = score != null ? Math.round(score) : null

  // baselines
  const last7 = metrics.slice(-7)
  const hrv7 = avg(last7.map((m) => m.hrv_status).filter((v): v is number => v != null))
  const rhr7 = avg(last7.map((m) => m.resting_hr).filter((v): v is number => v != null))
  const sleep7 = last7.map((m) => m.sleep_score).filter((v): v is number => v != null)
  const sleepAvg = avg(sleep7)
  const hrvNow = snapshot?.hrv_overnight_avg ?? latest?.hrv_status ?? null
  const rhrNow = latest?.resting_hr ?? null
  const sleepNow = latest?.sleep_score ?? null
  const stressNow = snapshot?.stress?.now ?? latest?.stress_level ?? null

  const status = tier === 'peak' || tier === 'ready'
    ? { t: de ? 'Du bist bereit für Leistung' : "You're primed to perform", s: de ? 'HRV und Ruhepuls sind im gesunden Bereich. Ziel: höhere Belastung heute.' : 'HRV and resting heart rate are in a healthy range. Aim for a higher strain today.' }
    : tier === 'caution'
      ? { t: de ? 'Moderat halten' : 'Keep it moderate', s: de ? 'Deine Erholung ist okay, aber nicht optimal — halte die Intensität im Zaum.' : 'Recovery is okay but not optimal — keep the intensity in check.' }
      : { t: de ? 'Erholung priorisieren' : 'Prioritize recovery', s: de ? 'Deine Signale zeigen Ermüdung. Ein leichter Tag zahlt sich aus.' : 'Your signals point to fatigue. An easy day will pay off.' }

  // Strain per day from activity TSS (WHOOP-style 0–21)
  const tssByDate = useMemo(() => {
    const m = new Map<string, number>()
    for (const a of acts?.activities ?? []) { const k = (a.started_at ?? '').slice(0, 10); if (k) m.set(k, (m.get(k) ?? 0) + (a.tss ?? 0)) }
    return m
  }, [acts])
  const todayKey = format(today, 'yyyy-MM-dd')
  const todayTSS = tssByDate.get(todayKey) ?? 0
  const todayStrain = todayTSS > 0 ? Math.min(21, todayTSS / 8) : null
  const targetStrain = score != null ? (score / 100) * 21 : null
  const bandLo = targetStrain != null ? Math.max(0, targetStrain - 2.5) : null
  const bandHi = targetStrain != null ? Math.min(21, targetStrain + 2.5) : null

  // ── Sleep need / debt / bed-by — computed from REAL sleep durations only. ──
  // Garmin gives no sleep-need or bedtime field, so we derive them honestly from
  // the nightly `sleep_detail.total_s` history.
  const recentSleep = useMemo(() => metrics
    .filter((m) => m.sleep_detail?.total_s != null && (m.sleep_detail.total_s as number) > 0)
    .slice(-14)
    .map((m) => ({ total_s: m.sleep_detail!.total_s as number, recorded_at: m.recorded_at ?? null })),
    [metrics])
  // Baseline sleep need: personal 14-night trailing avg once we have ≥3 nights,
  // else a fixed 8 h (480 min) adult baseline.
  const sleepCalibrating = recentSleep.length < 3
  const sleepNeedS = !sleepCalibrating ? Math.round(avg(recentSleep.map((r) => r.total_s))!) : 8 * 3600
  // Rolling sleep debt: signed shortfall vs baseline summed over last 7 nights, floored at 0.
  const debtWindow = recentSleep.slice(-7)
  const sleepDebtS = debtWindow.length ? Math.max(0, debtWindow.reduce((a, r) => a + (sleepNeedS - r.total_s), 0)) : null
  const lastNightS = recentSleep.length ? recentSleep[recentSleep.length - 1].total_s : null
  const debtTonightS = lastNightS != null ? Math.max(0, sleepNeedS - lastNightS) : 0
  // Tonight's need = baseline + last night's shortfall (catch-up), capped at 10 h.
  const needTonightS = Math.min(10 * 3600, sleepNeedS + debtTonightS)
  const WAKE_MIN = 7 * 60 // fixed 07:00 wake target — bed-by is derived from need + this.
  const bedByMin = ((WAKE_MIN - Math.round(needTonightS / 60)) % 1440 + 1440) % 1440
  const bedByTxt = `${String(Math.floor(bedByMin / 60)).padStart(2, '0')}:${String(bedByMin % 60).padStart(2, '0')}`
  const baselinePct = needTonightS > 0 ? (sleepNeedS / needTonightS) * 100 : 0
  const debtPct = needTonightS > 0 ? (debtTonightS / needTonightS) * 100 : 0

  // ── Sleep consistency — circular variance of derived bedtimes over ≤7 nights. ──
  // Bedtime-of-day ≈ recorded_at (morning sync) − total sleep. Only computed when a
  // real time-of-day signal exists (recorded_at is not pure date-only midnight).
  const consistencyPct = useMemo(() => {
    const nights = recentSleep.slice(-7).filter((r) => r.recorded_at)
    if (nights.length < 3) return null
    const wakeMins = nights.map((r) => {
      const d = parseISO(r.recorded_at as string)
      return d.getHours() * 60 + d.getMinutes()
    })
    if (!wakeMins.some((m) => m !== 0)) return null // date-only feed → no real start signal
    const angles = nights.map((r, i) => {
      const bedMin = ((wakeMins[i] - r.total_s / 60) % 1440 + 1440) % 1440
      return (bedMin / 1440) * 2 * Math.PI
    })
    const sinM = avg(angles.map((a) => Math.sin(a)))!
    const cosM = avg(angles.map((a) => Math.cos(a)))!
    const R = Math.sqrt(sinM * sinM + cosM * cosM)
    const stdMin = (R > 0 ? Math.sqrt(-2 * Math.log(R)) : Math.PI) / (2 * Math.PI) * 1440
    return Math.round(clamp(100 * (1 - stdMin / 120), 0, 100)) // 0 var→100%, 2h SD→0%
  }, [recentSleep])

  // Daytime stress distribution over last 7 days (Garmin stress 0–100)
  const stressBands = useMemo(() => {
    let low = 0, med = 0, high = 0
    for (const m of last7) { const s = m.stress_level; if (s == null) continue; if (s < 40) low++; else if (s < 65) med++; else high++ }
    const tot = low + med + high
    return { low, med, high, tot }
  }, [last7])

  // Recovery calendar — last 30 days coloured by readiness
  const calDays = useMemo(() => Array.from({ length: 30 }, (_, i) => {
    const d = subDays(today, 29 - i)
    const key = format(d, 'yyyy-MM-dd')
    const m = byDate.get(key)
    const s = m ? computeReadiness(m.hrv_status ?? null, m.body_battery ?? null, m.sleep_score ?? null) : null
    return { key, day: d.getDate(), dateLabel: format(d, de ? 'EEEE, d. MMM' : 'EEEE, MMM d'), score: s, weekday: (d.getDay() + 6) % 7, isToday: key === todayKey }
  }), [byDate, today, todayKey, de])
  const greenDays = calDays.filter((c) => c.score != null && c.score >= 66).length
  const calLead = calDays.length ? calDays[0].weekday : 0

  // Calendar-day detail — everything the daily feed backs for the tapped date.
  // Honest "—" for any field Garmin didn't record that day.
  const calDetail = useMemo(() => {
    if (!calSheet) return null
    const m = byDate.get(calSheet) ?? null
    const s = m ? (m.training_readiness ?? computeReadiness(m.hrv_status ?? null, m.body_battery ?? null, m.sleep_score ?? null)) : null
    const dsd = m?.sleep_detail ?? null
    const stg = dsd ? [
      { n: de ? 'Tief' : 'Deep', c: 'var(--color-strain)', s: dsd.deep_s },
      { n: de ? 'Leicht' : 'Light', c: 'var(--color-stand)', s: dsd.light_s },
      { n: 'REM', c: 'var(--color-recovery)', s: dsd.rem_s },
      { n: de ? 'Wach' : 'Awake', c: 'var(--color-muted)', s: dsd.awake_s },
    ] : []
    const stgSum = stg.reduce((a, x) => a + (x.s ?? 0), 0)
    const tss = tssByDate.get(calSheet) ?? 0
    const strain = tss > 0 ? Math.min(21, tss / 8) : null
    return {
      key: calSheet,
      dateLabel: format(parseISO(calSheet), de ? 'EEEE, d. MMMM' : 'EEEE, MMMM d'),
      hasData: m != null,
      score: s,
      tier: readinessTier(s ?? null),
      hrv: m?.hrv_status ?? null,
      rhr: m?.resting_hr ?? null,
      sleepScore: m?.sleep_score ?? null,
      sleepS: dsd?.total_s ?? null,
      stages: stg,
      stageSum: stgSum,
      stress: m?.stress_level ?? null,
      bodyBattery: m?.body_battery ?? null,
      vo2max: m?.vo2max ?? null,
      strain,
      resp: dsd?.respiration_avg ?? null,
      spo2: dsd?.spo2_avg ?? null,
    }
  }, [calSheet, byDate, tssByDate, de])

  // recommendation zone
  const zoneColor = tier === 'peak' || tier === 'ready' ? 'var(--color-recovery)' : tier === 'caution' ? 'var(--color-amber)' : 'var(--color-move)'
  const zoneLabel = tier === 'peak' || tier === 'ready' ? (de ? 'grüne Zone' : 'green zone') : tier === 'caution' ? (de ? 'gelbe Zone' : 'yellow zone') : (de ? 'rote Zone' : 'red zone')
  const recTitle = tier === 'peak' || tier === 'ready'
    ? (de ? 'Erholt — trainiere mit Absicht' : 'Recovered — train with intent')
    : tier === 'caution' ? (de ? 'Halb erholt — dosiere' : 'Half recovered — pace it')
      : (de ? 'Erschöpft — regeneriere' : 'Depleted — recover')
  const recBody = tier === 'peak' || tier === 'ready'
    ? (de ? 'HRV liegt über der Basislinie und der Schlaf war stark. Nutze das Fenster für eine Qualitätseinheit — schütze danach den Schlaf.' : 'HRV is above baseline and sleep was strong. Use the window for a quality session, then protect recovery tonight.')
    : (de ? 'Deine Signale zeigen Ermüdung. Halte es locker und ziele auf 7,5 h+ Schlaf, damit HRV und Anpassung zurückkommen.' : 'Your signals point to fatigue. Keep it easy and aim for 7.5h+ sleep so HRV and adaptation rebound.')

  // Sleep Quality tiles (fixed .pen labels; fill the ones real data now backs).
  const sleepTiles: { l: string; v: string; note?: string }[] = [
    { l: de ? 'Effizienz' : 'Efficiency', v: efficiency != null ? `${efficiency}%` : DASH },
    { l: de ? 'Einschlafzeit' : 'Latency', v: DASH, note: de ? 'nicht erfasst' : 'not tracked' },
    { l: de ? 'Störungen' : 'Disturbances', v: sd?.awake_count != null ? String(sd.awake_count) : DASH },
    { l: de ? 'Zeit im Bett' : 'Time in bed', v: timeInBed != null ? fmtHm(timeInBed) : DASH },
    { l: de ? 'Konstanz' : 'Consistency', v: consistencyPct != null ? `${consistencyPct}%` : DASH, note: consistencyPct != null ? (de ? 'Einschlafzeit-Streuung' : 'bedtime variance') : (de ? 'zu wenig Nächte' : 'not enough nights') },
    { l: de ? 'Atemrate' : 'Resp. rate', v: sd?.respiration_avg != null ? sd.respiration_avg.toFixed(0) : DASH },
  ]

  return (
    <div className="flex flex-col gap-6 pb-4">
      {/* 1 · Header */}
      <div className="flex items-center justify-between">
        <div className="flex flex-col" style={{ gap: 2 }}>
          <span className="eyebrow" style={{ fontSize: 12, fontWeight: 600, letterSpacing: '0.08em', color: 'var(--color-muted)' }}>{format(today, de ? 'EEEE, d. MMM' : 'EEEE, MMM d').toUpperCase()}</span>
          <h1 className="num-display" style={{ fontSize: 28, color: 'var(--color-ink)' }}>{de ? 'Erholung' : 'Recovery'}</h1>
        </div>
        <Link to="/recovery/trends" className="hover-card inline-flex items-center rounded-full" style={{ gap: 7, padding: '9px 14px', background: 'var(--color-paper-2)', border: '1px solid var(--color-rule)' }}>
          <LineChart size={16} strokeWidth={2.2} style={{ color: 'var(--color-accent)' }} />
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-ink)' }}>{de ? 'Trends' : 'Trends'}</span>
          <ChevronRight size={15} className="hover-arrow" style={{ color: 'var(--color-muted)' }} />
        </Link>
      </div>

      {/* 2 · Recovery hero */}
      <div className="rounded-[24px] flex flex-col items-center" style={{ ...cardStyle, gap: 18, padding: '28px 20px' }}>
        <ScoreRing score={score ?? 0} color={rColor} size={208} stroke={14}>
          <div className="flex flex-col items-center">
            <span className="num-display" style={{ fontSize: 64, color: 'var(--color-ink)', lineHeight: 1 }}>{scoreTxt ?? DASH}</span>
            <span className="eyebrow" style={{ fontSize: 14, fontWeight: 600, letterSpacing: '0.07em', color: rColor }}>{de ? '% ERHOLT' : '% RECOVERED'}</span>
          </div>
        </ScoreRing>
        <div className="flex flex-col items-center gap-1 text-center">
          <h3 className="num-display" style={{ fontSize: 17, color: 'var(--color-ink)' }}>{status.t}</h3>
          <p style={{ fontSize: 13, color: 'var(--color-ink-2)', lineHeight: 1.4 }}>{status.s}</p>
        </div>
      </div>

      {/* 3 · Recovery Drivers */}
      <div className="rounded-[24px] p-5 flex flex-col" style={{ ...cardStyle, gap: 16 }}>
        <div className="flex flex-col" style={{ gap: 2 }}>
          <span className="num-display" style={{ fontSize: 16, color: 'var(--color-ink)' }}>{de ? 'Erholungs-Treiber' : 'Recovery Drivers'}</span>
          <span style={{ fontSize: 12, color: 'var(--color-ink-2)' }}>{de ? `Was den ${scoreTxt ?? DASH}%-Wert heute prägt` : `What shaped today's ${scoreTxt ?? DASH}% score`}</span>
        </div>
        <Driver icon={Activity} label="HRV"
          value={hrvNow != null ? `${Math.round(hrvNow)} ms` : DASH}
          delta={hrvNow != null && hrv7 != null ? `${hrvNow - hrv7 >= 0 ? '+' : '−'}${Math.abs(Math.round(hrvNow - hrv7))}` : null}
          deltaColor={hrvNow != null && hrv7 != null && hrvNow >= hrv7 ? 'var(--color-recovery)' : 'var(--color-amber)'}
          dev={hrvNow != null && hrv7 != null ? clamp((hrvNow - hrv7) / 20, -1, 1) : null}
          segColor={hrvNow != null && hrv7 != null && hrvNow < hrv7 ? 'var(--color-amber)' : 'var(--color-recovery)'} />
        <Driver icon={Heart} label={de ? 'Ruhepuls' : 'Resting HR'}
          value={rhrNow != null ? `${Math.round(rhrNow)} bpm` : DASH}
          delta={rhrNow != null && rhr7 != null ? `${rhrNow <= rhr7 ? '−' : '+'}${Math.abs(Math.round(rhrNow - rhr7))}` : null}
          deltaColor={rhrNow != null && rhr7 != null && rhrNow <= rhr7 ? 'var(--color-recovery)' : 'var(--color-amber)'}
          dev={rhrNow != null && rhr7 != null ? clamp((rhr7 - rhrNow) / 8, -1, 1) : null}
          segColor={rhrNow != null && rhr7 != null && rhrNow > rhr7 ? 'var(--color-amber)' : 'var(--color-recovery)'} />
        <Driver icon={Wind} label={de ? 'Atmung' : 'Respiratory'}
          value={sd?.respiration_avg != null ? `${sd.respiration_avg.toFixed(0)} br/min` : DASH}
          delta={null} deltaColor="var(--color-muted)" dev={null}
          segColor={sd?.respiration_avg != null ? 'var(--color-recovery)' : 'var(--color-muted)'} />
        <Driver icon={Droplet} label={de ? 'Ruhe-SpO₂' : 'Resting SpO₂'}
          value={sd?.spo2_avg != null ? `${Math.round(sd.spo2_avg)}%` : DASH}
          delta={null} deltaColor="var(--color-muted)" dev={null}
          segColor={sd?.spo2_avg != null ? 'var(--color-recovery)' : 'var(--color-muted)'} />
        {/* Skin temp is not in Garmin's daily feed (skinTempDataExists:false) — honest "Not tracked", never a fabricated °. */}
        <Driver icon={Thermometer} label={de ? 'Hauttemp.' : 'Skin temp'} value={de ? 'Nicht erfasst' : 'Not tracked'} delta={null} deltaColor="var(--color-muted)" dev={null} segColor="var(--color-muted)" />
        <Driver icon={Moon} label={de ? 'Schlaf' : 'Sleep perf.'}
          value={sleepNow != null ? `${Math.round(sleepNow)}%` : DASH}
          delta={sleepNow != null && sleepAvg != null ? `${sleepNow - sleepAvg >= 0 ? '+' : '−'}${Math.abs(Math.round(sleepNow - sleepAvg))}` : null}
          deltaColor={sleepNow != null && sleepAvg != null && sleepNow >= sleepAvg ? 'var(--color-recovery)' : 'var(--color-amber)'}
          dev={sleepNow != null && sleepAvg != null ? clamp((sleepNow - sleepAvg) / 20, -1, 1) : null}
          segColor={sleepNow != null && sleepAvg != null && sleepNow < sleepAvg ? 'var(--color-amber)' : 'var(--color-recovery)'} />
      </div>

      {/* 4 · Metric row */}
      <div className="grid grid-cols-2 gap-3">
        <MetricCard icon={Activity} iconColor="var(--color-recovery)" label="HRV" value={hrvNow != null ? `${Math.round(hrvNow)}` : DASH} unit="ms"
          trend={hrvNow != null && hrv7 != null ? { text: `${hrvNow - hrv7 >= 0 ? '+' : ''}${Math.round(hrvNow - hrv7)} ${de ? 'vs Ø' : 'vs avg'}`, color: hrvNow >= hrv7 ? 'var(--color-recovery)' : 'var(--color-amber)', dir: hrvNow >= hrv7 ? 'up' : 'down' } : undefined} />
        <MetricCard icon={Heart} iconColor="var(--color-accent)" label={de ? 'Ruhepuls' : 'Resting HR'} value={rhrNow != null ? `${Math.round(rhrNow)}` : DASH} unit="bpm"
          trend={rhrNow != null && rhr7 != null ? { text: `${Math.round(Math.abs(rhrNow - rhr7))} ${rhrNow <= rhr7 ? (de ? 'unter Ø' : 'below avg') : (de ? 'über Ø' : 'above avg')}`, color: rhrNow <= rhr7 ? 'var(--color-recovery)' : 'var(--color-amber)', dir: rhrNow <= rhr7 ? 'down' : 'up' } : undefined} />
      </div>

      {/* 6 · Sleep (stages — no backend duration/stage feed → graceful) */}
      <div className="rounded-[24px] p-5 flex flex-col" style={{ ...cardStyle, gap: 16 }}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2"><Moon size={18} style={{ color: 'var(--color-strain)' }} /><span className="num-display" style={{ fontSize: 16, color: 'var(--color-ink)' }}>{de ? 'Schlaf' : 'Sleep'}</span></div>
          {sleepNow != null && <span className="rounded-full" style={{ padding: '5px 10px', background: 'color-mix(in srgb, var(--color-strain) 15%, transparent)', fontSize: 12, fontWeight: 600, color: 'var(--color-strain)' }}>{Math.round(sleepNow)}% {de ? 'Leistung' : 'performance'}</span>}
        </div>
        <div className="flex items-end gap-1.5">
          <span className="num-display" style={{ fontSize: 34, color: 'var(--color-ink)' }}>{fmtHm(sd?.total_s)}</span>
          <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--color-muted)', paddingBottom: 6 }}>{sd?.total_s != null ? (de ? 'geschlafen' : 'asleep') : (de ? 'Dauer nicht erfasst' : 'duration not tracked')}</span>
        </div>
        {stageSum > 0 ? (
          <div className="flex overflow-hidden" style={{ height: 14, borderRadius: 7, gap: 2 }}>
            {sleepStages.map((s) => (
              (s.s ?? 0) > 0 ? <div key={s.n} title={`${de ? s.de : s.n}: ${fmtHm(s.s)} (${Math.round(((s.s ?? 0) / stageSum) * 100)}%)`} style={{ width: `${((s.s ?? 0) / stageSum) * 100}%`, background: s.c }} /> : null
            ))}
          </div>
        ) : (
          <div style={{ height: 14, borderRadius: 7, background: 'var(--color-surface-3)' }} />
        )}
        <div className="flex justify-between">
          {sleepStages.length ? sleepStages.map((s) => (
            <div key={s.n} className="flex flex-col gap-1">
              <div className="flex items-center gap-1.5"><span style={{ width: 8, height: 8, borderRadius: 999, background: s.c }} /><span style={{ fontSize: 11, fontWeight: 500, color: 'var(--color-ink-2)' }}>{de ? s.de : s.n}</span></div>
              <span className="num-display" style={{ fontSize: 13, color: 'var(--color-ink)' }}>{fmtHm(s.s)}</span>
              <span className="num-mono" style={{ fontSize: 10, fontWeight: 500, color: 'var(--color-muted)' }}>{s.s != null && stageSum > 0 ? `${Math.round((s.s / stageSum) * 100)}%` : DASH}</span>
            </div>
          )) : [{ n: 'Deep', de: 'Tief', c: 'var(--color-strain)' }, { n: 'Light', de: 'Leicht', c: 'var(--color-stand)' }, { n: 'REM', de: 'REM', c: 'var(--color-recovery)' }, { n: 'Awake', de: 'Wach', c: 'var(--color-muted)' }].map((s) => (
            <div key={s.n} className="flex flex-col gap-1">
              <div className="flex items-center gap-1.5"><span style={{ width: 8, height: 8, borderRadius: 999, background: s.c }} /><span style={{ fontSize: 11, fontWeight: 500, color: 'var(--color-ink-2)' }}>{de ? s.de : s.n}</span></div>
              <span className="num-display" style={{ fontSize: 13, color: 'var(--color-ink)' }}>{DASH}</span>
            </div>
          ))}
        </div>
      </div>

      {/* 8 · Sleep Need Tonight — need/debt/bed-by COMPUTED from real sleep durations. */}
      <div className="rounded-[24px] p-5 flex flex-col" style={{ ...cardStyle, gap: 16 }}>
        <div className="flex items-end justify-between">
          <div className="flex flex-col" style={{ gap: 2 }}>
            <span className="eyebrow" style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-muted)' }}>{de ? 'SCHLAFBEDARF HEUTE' : 'SLEEP NEED TONIGHT'}</span>
            <span className="num-display" style={{ fontSize: 34, color: 'var(--color-ink)' }}>{fmtHm(needTonightS)}</span>
          </div>
          <div className="flex flex-col items-end" style={{ gap: 2 }}>
            <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--color-muted)' }}>{de ? 'Ins Bett bis' : 'Bed by'}</span>
            <span className="num-display" style={{ fontSize: 18, color: 'var(--color-strain)' }}>{bedByTxt}</span>
            <span style={{ fontSize: 10, color: 'var(--color-muted)' }}>{de ? 'für 07:00 Wecker' : 'for 07:00 wake'}</span>
          </div>
        </div>
        <div className="flex overflow-hidden" style={{ height: 14, borderRadius: 7, gap: 2 }}>
          <div title={`${de ? 'Basis' : 'Baseline'} ${fmtHm(sleepNeedS)}`} style={{ width: `${baselinePct}%`, background: 'var(--color-strain)' }} />
          {debtPct > 0 && <div title={`${de ? 'Nachholbedarf' : 'Catch-up'} ${fmtHm(debtTonightS)}`} style={{ width: `${debtPct}%`, background: 'var(--color-amber)' }} />}
        </div>
        <div className="flex justify-between">
          {[
            { n: de ? 'Basis' : 'Baseline', c: 'var(--color-strain)', v: fmtHm(sleepNeedS), note: sleepCalibrating ? (de ? '8 h Standard' : '8h default') : (de ? '14-Nächte-Ø' : '14-night avg') },
            { n: de ? 'Schlafdefizit' : 'Sleep debt', c: 'var(--color-amber)', v: sleepDebtS != null ? fmtHm(sleepDebtS) : DASH, note: sleepDebtS != null ? (de ? 'roll. 7 Nächte' : 'rolling 7 nights') : (de ? 'kalibriert noch' : 'calibrating') },
            { n: de ? 'Belastung' : 'Strain', c: 'var(--color-accent)', v: todayStrain != null ? todayStrain.toFixed(1) : '0.0', note: de ? 'heute bisher' : 'today so far' },
          ].map((s) => (
            <div key={s.n} className="flex flex-col" style={{ gap: 3 }}>
              <div className="flex items-center gap-1.5"><span style={{ width: 8, height: 8, borderRadius: 999, background: s.c }} /><span style={{ fontSize: 11, fontWeight: 500, color: 'var(--color-ink-2)' }}>{s.n}</span></div>
              <span className="num-display" style={{ fontSize: 13, color: s.v === DASH ? 'var(--color-ink-2)' : 'var(--color-ink)' }}>{s.v}</span>
              <span style={{ fontSize: 9, fontWeight: 500, color: 'var(--color-muted)' }}>{s.note}</span>
            </div>
          ))}
        </div>
      </div>

      {/* 9 · Sleep Quality (efficiency/latency/etc not in feed → graceful tiles) */}
      <div className="rounded-[24px] p-5 flex flex-col" style={{ ...cardStyle, gap: 14 }}>
        <span className="num-display" style={{ fontSize: 16, color: 'var(--color-ink)' }}>{de ? 'Schlafqualität' : 'Sleep Quality'}</span>
        {[sleepTiles.slice(0, 3), sleepTiles.slice(3, 6)].map((rowTiles, ri) => (
          <div key={ri} className="grid grid-cols-3 gap-2.5">
            {rowTiles.map((tile) => (
              <div key={tile.l} title={tile.note} className="flex flex-col rounded-[12px] p-3" style={{ background: 'var(--color-surface-2)', gap: 3 }}>
                <span className="num-display" style={{ fontSize: 18, color: tile.v === DASH ? 'var(--color-ink-2)' : 'var(--color-ink)' }}>{tile.v}</span>
                <span style={{ fontSize: 10, fontWeight: 500, color: 'var(--color-muted)' }}>{tile.l}</span>
                {tile.note && <span style={{ fontSize: 9, fontWeight: 500, color: 'var(--color-muted)', opacity: 0.8 }}>{tile.note}</span>}
              </div>
            ))}
          </div>
        ))}
      </div>

      {/* 10 · Today's Strain Target → load-form drill-down */}
      <Link to="/load-form" className="hover-card rounded-[24px] p-5 flex flex-col" style={{ ...cardStyle, gap: 16 }}>
        <div className="flex items-end justify-between">
          <div className="flex flex-col" style={{ gap: 2 }}>
            <span className="eyebrow flex items-center gap-1.5" style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-muted)' }}>{de ? 'BELASTUNGSZIEL HEUTE' : "TODAY'S STRAIN TARGET"}<ChevronRight size={14} className="hover-arrow" style={{ color: 'var(--color-muted)' }} /></span>
            <span className="flex items-end gap-1.5">
              <span className="num-display" style={{ fontSize: 34, color: 'var(--color-recovery)' }}>{targetStrain != null ? targetStrain.toFixed(1) : DASH}</span>
              <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--color-muted)', paddingBottom: 6 }}>{de ? 'optimal' : 'optimal'}</span>
            </span>
          </div>
          <div className="flex flex-col items-end" style={{ gap: 2 }}>
            <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--color-muted)' }}>{de ? 'Bisher' : 'So far'}</span>
            <span className="num-display" style={{ fontSize: 18, color: 'var(--color-ink)' }}>{todayStrain != null ? todayStrain.toFixed(1) : '0.0'}</span>
          </div>
        </div>
        <div style={{ position: 'relative', height: 24 }}>
          <div style={{ position: 'absolute', top: 8, left: 0, right: 0, height: 8, borderRadius: 4, background: 'var(--color-surface-3)' }} />
          {bandLo != null && bandHi != null && <div style={{ position: 'absolute', top: 8, height: 8, borderRadius: 4, left: `${(bandLo / 21) * 100}%`, width: `${((bandHi - bandLo) / 21) * 100}%`, background: 'var(--color-recovery)' }} />}
          <div style={{ position: 'absolute', top: 8, left: 0, height: 8, borderRadius: 4, width: `${((todayStrain ?? 0) / 21) * 100}%`, background: 'var(--color-strain)' }} />
          <div style={{ position: 'absolute', top: 3, left: `calc(${((todayStrain ?? 0) / 21) * 100}% - 2px)`, width: 5, height: 18, borderRadius: 3, background: 'var(--color-ink)', border: '2px solid var(--color-paper-2)' }} />
        </div>
        <div className="flex items-center justify-between">
          <span className="num-mono" style={{ fontSize: 10, color: 'var(--color-muted)' }}>0</span>
          <span style={{ fontSize: 10, fontWeight: 500, color: 'var(--color-recovery)' }}>{de ? 'Optimalzone' : 'Optimal zone'}</span>
          <span className="num-mono" style={{ fontSize: 10, color: 'var(--color-muted)' }}>21</span>
        </div>
        <div className="hover-reveal flex flex-col gap-1.5" style={{ borderTop: '1px solid var(--color-rule)', paddingTop: 10 }}>
          {targetStrain != null && bandLo != null && bandHi != null && (
            <span style={{ fontSize: 12, color: 'var(--color-ink-2)' }}>{de ? 'Optimalband' : 'Optimal band'} <span className="num-mono" style={{ fontWeight: 700, color: 'var(--color-ink)' }}>{bandLo.toFixed(1)}–{bandHi.toFixed(1)}</span> · {de ? 'Ziel' : 'target'} <span className="num-mono" style={{ fontWeight: 700, color: 'var(--color-recovery)' }}>{targetStrain.toFixed(1)}</span></span>
          )}
          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-accent)' }}>{de ? 'Belastung & Form ansehen →' : 'View load & form →'}</span>
        </div>
      </Link>

      {/* 11 · Daytime Stress */}
      <div className="rounded-[24px] p-5 flex flex-col" style={{ ...cardStyle, gap: 14 }}>
        <div className="flex items-center justify-between">
          <span className="num-display" style={{ fontSize: 16, color: 'var(--color-ink)' }}>{de ? 'Tagesstress' : 'Daytime Stress'}</span>
          <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--color-ink-2)' }}>{stressNow != null ? `${de ? 'Aktuell' : 'Now'} ${Math.round(stressNow)}` : DASH}</span>
        </div>
        {stressBands.tot > 0 ? (
          <>
            <div className="flex overflow-hidden" style={{ height: 14, borderRadius: 7, gap: 2 }}>
              <div title={`${de ? 'Niedrig' : 'Low'}: ${stressBands.low} ${de ? 'Tage' : 'days'} (${Math.round((stressBands.low / stressBands.tot) * 100)}%)`} style={{ width: `${(stressBands.low / stressBands.tot) * 100}%`, background: 'var(--color-recovery)' }} />
              <div title={`${de ? 'Mittel' : 'Medium'}: ${stressBands.med} ${de ? 'Tage' : 'days'} (${Math.round((stressBands.med / stressBands.tot) * 100)}%)`} style={{ width: `${(stressBands.med / stressBands.tot) * 100}%`, background: 'var(--color-amber)' }} />
              <div title={`${de ? 'Hoch' : 'High'}: ${stressBands.high} ${de ? 'Tage' : 'days'} (${Math.round((stressBands.high / stressBands.tot) * 100)}%)`} style={{ width: `${(stressBands.high / stressBands.tot) * 100}%`, background: 'var(--color-move)' }} />
            </div>
            <div className="flex justify-between">
              {[{ n: de ? 'Niedrig' : 'Low', c: 'var(--color-recovery)', v: stressBands.low }, { n: de ? 'Mittel' : 'Medium', c: 'var(--color-amber)', v: stressBands.med }, { n: de ? 'Hoch' : 'High', c: 'var(--color-move)', v: stressBands.high }].map((s) => (
                <div key={s.n} className="flex items-center gap-1.5">
                  <span style={{ width: 8, height: 8, borderRadius: 999, background: s.c }} />
                  <div className="flex flex-col"><span style={{ fontSize: 11, fontWeight: 500, color: 'var(--color-ink-2)' }}>{s.n}</span><span className="num-display" style={{ fontSize: 12, color: 'var(--color-ink)' }}>{s.v} {de ? 'T' : 'd'}</span></div>
                </div>
              ))}
            </div>
          </>
        ) : (
          <span style={{ fontSize: 12, color: 'var(--color-muted)' }}>{de ? 'Keine Stressdaten in den letzten 7 Tagen' : 'No stress data in the last 7 days'}</span>
        )}
      </div>

      {/* 12 · Recommendation → act on it in today's plan */}
      <Link to="/dashboard?tab=today" className="hover-card rounded-[24px] p-5 flex flex-col" style={{ gap: 14, background: 'color-mix(in srgb, var(--color-recovery) 15%, var(--color-paper-2))', border: '1px solid var(--color-recovery)' }}>
        <div className="flex items-center" style={{ gap: 12 }}>
          <span className="shrink-0 grid place-items-center rounded-full" style={{ width: 40, height: 40, background: zoneColor }}><Zap size={22} strokeWidth={2.2} style={{ color: 'var(--color-paper)' }} /></span>
          <div className="flex flex-col min-w-0" style={{ gap: 1 }}>
            <span className="num-display" style={{ fontSize: 18, color: 'var(--color-ink)' }}>{recTitle}</span>
            <span style={{ fontSize: 12, fontWeight: 500, color: zoneColor }}>{scoreTxt != null ? `${scoreTxt}% ${de ? 'Erholung' : 'recovery'} · ${zoneLabel}` : zoneLabel}</span>
          </div>
          <ChevronRight size={20} className="hover-arrow shrink-0" style={{ marginLeft: 'auto', color: zoneColor }} />
        </div>
        <p style={{ fontSize: 13, color: 'var(--color-ink-2)', lineHeight: 1.45 }}>{recBody}</p>
        <div className="flex gap-2.5">
          {[{ icon: Sunset, l: de ? 'Runterfahren' : 'Wind-down' }, { icon: Moon, l: de ? 'Licht aus' : 'Lights out' }].map((a) => (
            <div key={a.l} className="flex-1 flex items-center rounded-[14px]" style={{ gap: 9, padding: 12, background: 'color-mix(in srgb, var(--color-paper) 50%, transparent)' }}>
              <a.icon size={18} style={{ color: 'var(--color-recovery)' }} />
              <div className="flex flex-col" style={{ gap: 1 }}><span style={{ fontSize: 10, fontWeight: 500, color: 'var(--color-muted)' }}>{a.l}</span><span className="num-display" style={{ fontSize: 14, color: 'var(--color-ink-2)' }}>{DASH}</span></div>
            </div>
          ))}
        </div>
        <div className="hover-reveal" style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-accent)' }}>{de ? 'Zum heutigen Plan →' : "Go to today's plan →"}</div>
      </Link>

      {/* 13 · Recovery Calendar */}
      <div className="rounded-[24px] p-5 flex flex-col" style={{ ...cardStyle, gap: 16 }}>
        <div className="flex items-end justify-between">
          <div className="flex flex-col" style={{ gap: 2 }}>
            <span className="num-display" style={{ fontSize: 16, color: 'var(--color-ink)' }}>{de ? 'Erholungs-Kalender' : 'Recovery Calendar'}</span>
            <span style={{ fontSize: 12, color: 'var(--color-muted)' }}>{de ? 'Letzte 30 Tage · Tag antippen' : 'Last 30 days · tap a day'}</span>
          </div>
          <div className="flex flex-col items-end">
            <span className="num-display" style={{ fontSize: 26, color: 'var(--color-recovery)' }}>{greenDays}</span>
            <span style={{ fontSize: 11, color: 'var(--color-ink-2)' }}>{de ? 'grüne Tage' : 'green days'}</span>
          </div>
        </div>
        <div className="grid grid-cols-7 gap-1.5">
          {(de ? ['M', 'D', 'M', 'D', 'F', 'S', 'S'] : ['M', 'T', 'W', 'T', 'F', 'S', 'S']).map((d, i) => <span key={i} className="text-center" style={{ fontSize: 11, color: 'var(--color-muted)' }}>{d}</span>)}
          {Array.from({ length: calLead }).map((_, i) => <div key={`b${i}`} style={{ height: 34, borderRadius: 8, background: 'var(--color-surface-2)' }} />)}
          {calDays.map((c) => (
            <button key={c.key} type="button" onClick={() => setCalSheet(c.key)} title={`${c.dateLabel} · ${c.score != null ? `${Math.round(c.score)}% ${de ? 'Bereitschaft' : 'readiness'}` : (de ? 'keine Daten' : 'no data')}`} className="grid place-items-center" style={{ height: 34, borderRadius: 8, padding: 0, background: c.score != null ? `color-mix(in srgb, ${tierColor(c.score)} 15%, transparent)` : 'var(--color-surface-2)', border: c.isToday ? '1.5px solid var(--color-accent)' : '1px solid transparent', cursor: 'pointer' }}>
              <span className="num-mono" style={{ fontSize: 12, fontWeight: 600, color: c.score != null ? tierColor(c.score) : 'var(--color-muted)' }}>{c.day}</span>
            </button>
          ))}
        </div>
        <div className="flex items-center gap-4">
          {[{ n: de ? 'Hoch' : 'High', c: 'var(--color-recovery)' }, { n: de ? 'Mittel' : 'Moderate', c: 'var(--color-amber)' }, { n: de ? 'Niedrig' : 'Low', c: 'var(--color-move)' }].map((l) => (
            <div key={l.n} className="flex items-center gap-1.5"><span style={{ width: 12, height: 12, borderRadius: 4, background: l.c }} /><span style={{ fontSize: 12, color: 'var(--color-ink-2)' }}>{l.n}</span></div>
          ))}
        </div>
      </div>

      {/* 15 · Behaviors & Journal (no journal feed → empty state) */}
      <div className="rounded-[24px] p-5 flex flex-col" style={{ ...cardStyle, gap: 14 }}>
        <div className="flex items-end justify-between">
          <div className="flex flex-col" style={{ gap: 2 }}>
            <span className="num-display" style={{ fontSize: 16, color: 'var(--color-ink)' }}>{de ? 'Verhalten & Journal' : 'Behaviors & Journal'}</span>
            <span style={{ fontSize: 12, color: 'var(--color-muted)' }}>{de ? 'Gemessene Auswirkung auf die Erholung' : 'Measured impact on recovery'}</span>
          </div>
          <span style={{ fontSize: 11, color: 'var(--color-muted)' }}>{de ? '30-Tage-Ø' : '30-day avg'}</span>
        </div>
        <div className="grid place-items-center rounded-[14px]" style={{ minHeight: 72, background: 'var(--color-surface-2)' }}>
          <span style={{ fontSize: 12, color: 'var(--color-muted)' }}>{de ? 'Noch keine Verhaltensdaten erfasst' : 'No behaviors logged yet'}</span>
        </div>
      </div>

      {/* Calendar-day detail — tap a past day in the calendar to browse it. */}
      <BottomSheet
        open={calSheet != null}
        onClose={() => setCalSheet(null)}
        eyebrow={de ? 'TAGESDETAIL' : 'DAY DETAIL'}
        title={calDetail?.dateLabel ?? ''}
      >
        {calDetail && (
          !calDetail.hasData ? (
            <div className="grid place-items-center rounded-[16px]" style={{ minHeight: 120, background: 'var(--color-surface-2)' }}>
              <span style={{ fontSize: 13, color: 'var(--color-muted)' }}>{de ? 'Keine Daten für diesen Tag' : 'No data recorded for this day'}</span>
            </div>
          ) : (
            <div className="flex flex-col" style={{ gap: 14 }}>
              {/* Readiness headline */}
              <div className="flex items-center justify-between rounded-[16px] p-4" style={{ background: 'var(--color-surface-2)' }}>
                <div className="flex flex-col" style={{ gap: 2 }}>
                  <span className="eyebrow" style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', color: 'var(--color-muted)' }}>{de ? 'ERHOLUNG' : 'RECOVERY'}</span>
                  <span style={{ fontSize: 12, color: 'var(--color-ink-2)' }}>{calDetail.tier ? (de ? 'Bereitschaft' : 'Readiness') : (de ? 'keine Bewertung' : 'no score')}</span>
                </div>
                <div className="flex items-end" style={{ gap: 4 }}>
                  <span className="num-display" style={{ fontSize: 40, lineHeight: 1, color: tierColor(calDetail.score ?? null) }}>{calDetail.score != null ? Math.round(calDetail.score) : DASH}</span>
                  {calDetail.score != null && <span style={{ fontSize: 13, fontWeight: 600, color: tierColor(calDetail.score), paddingBottom: 4 }}>%</span>}
                </div>
              </div>

              {/* Vitals grid */}
              <div className="grid grid-cols-2" style={{ gap: 10 }}>
                {[
                  { l: 'HRV', v: calDetail.hrv != null ? String(Math.round(calDetail.hrv)) : DASH, u: 'ms', c: 'var(--color-recovery)' },
                  { l: de ? 'Ruhepuls' : 'Resting HR', v: calDetail.rhr != null ? String(Math.round(calDetail.rhr)) : DASH, u: 'bpm', c: 'var(--color-accent)' },
                  { l: de ? 'Body Battery' : 'Body Battery', v: calDetail.bodyBattery != null ? String(Math.round(calDetail.bodyBattery)) : DASH, u: '/100', c: 'var(--color-recovery)' },
                  { l: de ? 'Tagesstress' : 'Daytime stress', v: calDetail.stress != null ? String(Math.round(calDetail.stress)) : DASH, u: '/100', c: 'var(--color-amber)' },
                  { l: de ? 'Belastung' : 'Strain', v: calDetail.strain != null ? calDetail.strain.toFixed(1) : DASH, u: '/21', c: 'var(--color-strain)' },
                  { l: 'VO₂max', v: calDetail.vo2max != null ? String(Math.round(calDetail.vo2max)) : DASH, u: '', c: 'var(--color-exercise)' },
                ].map((t) => (
                  <div key={t.l} className="flex flex-col rounded-[14px] p-3" style={{ background: 'var(--color-surface-2)', gap: 3 }}>
                    <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--color-muted)' }}>{t.l}</span>
                    <span className="flex items-end" style={{ gap: 3 }}>
                      <span className="num-display" style={{ fontSize: 22, color: t.v === DASH ? 'var(--color-ink-2)' : t.c }}>{t.v}</span>
                      {t.u && t.v !== DASH && <span style={{ fontSize: 10, color: 'var(--color-muted)', paddingBottom: 3 }}>{t.u}</span>}
                    </span>
                  </div>
                ))}
              </div>

              {/* Sleep */}
              <div className="flex flex-col rounded-[16px] p-4" style={{ background: 'var(--color-surface-2)', gap: 12 }}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2"><Moon size={16} style={{ color: 'var(--color-strain)' }} /><span style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-ink)' }}>{de ? 'Schlaf' : 'Sleep'}</span></div>
                  {calDetail.sleepScore != null && <span className="num-mono" style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-strain)' }}>{Math.round(calDetail.sleepScore)}% {de ? 'Leistung' : 'perf.'}</span>}
                </div>
                <div className="flex items-end" style={{ gap: 6 }}>
                  <span className="num-display" style={{ fontSize: 28, color: 'var(--color-ink)' }}>{fmtHm(calDetail.sleepS)}</span>
                  <span style={{ fontSize: 12, color: 'var(--color-muted)', paddingBottom: 5 }}>{calDetail.sleepS != null ? (de ? 'geschlafen' : 'asleep') : (de ? 'nicht erfasst' : 'not tracked')}</span>
                </div>
                {calDetail.stageSum > 0 && (
                  <>
                    <div className="flex overflow-hidden" style={{ height: 12, borderRadius: 6, gap: 2 }}>
                      {calDetail.stages.map((s) => ((s.s ?? 0) > 0 ? <div key={s.n} title={`${s.n}: ${fmtHm(s.s)}`} style={{ width: `${((s.s ?? 0) / calDetail.stageSum) * 100}%`, background: s.c }} /> : null))}
                    </div>
                    <div className="flex justify-between">
                      {calDetail.stages.map((s) => (
                        <div key={s.n} className="flex flex-col gap-1">
                          <div className="flex items-center gap-1.5"><span style={{ width: 7, height: 7, borderRadius: 999, background: s.c }} /><span style={{ fontSize: 10, fontWeight: 500, color: 'var(--color-ink-2)' }}>{s.n}</span></div>
                          <span className="num-display" style={{ fontSize: 12, color: 'var(--color-ink)' }}>{fmtHm(s.s)}</span>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            </div>
          )
        )}
      </BottomSheet>
    </div>
  )
}
