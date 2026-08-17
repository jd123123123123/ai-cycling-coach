import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTodaySnapshot } from '../../hooks/useTodaySnapshot'
import { useDailyMetrics } from '../../hooks/useDailyMetrics'
import { useAdaptive } from '../../hooks/useAdaptive'
import { usePMC } from '../../hooks/usePMC'
import { computeReadiness, canonicalReadiness, readinessTier } from '../../utils/metrics'
import type { DailyMetric } from '../../api/dashboard'
import W3ReadinessView, { type W3ReadinessVm, type DriverVm, type DriverIcon, type SleepStage } from './W3ReadinessView'

/**
 * W3 · READINESS, wired to real data. Route /e/w3-readiness.
 *
 * Real: the canonical readiness (the daily decision's score/tier, the same one
 * Today shows — device composite only as the loading fallback), the overnight
 * snapshot (body battery / stress / recovery time), and the 30-day daily
 * metrics (HRV, resting HR, sleep). Each driver shows its value, its delta
 * against the athlete's own 7-day baseline, and a 7-sample spark; honest "—"
 * where a signal is missing.
 */

const num = (v: number | null | undefined): number | null => (v == null || Number.isNaN(v) ? null : v)
/** Trailing series of a metric key (oldest→newest), nulls dropped. */
function seriesOf(metrics: DailyMetric[], pick: (m: DailyMetric) => number | null | undefined, n = 8): number[] {
  return metrics.map(pick).map(num).filter((v): v is number => v != null).slice(-n)
}
function normalize(series: number[]): number[] {
  const max = Math.max(1, ...series.map((v) => Math.abs(v)))
  return series.map((v) => Math.max(0.08, Math.abs(v) / max))
}
const round = (v: number, d = 0) => { const p = 10 ** d; return Math.round(v * p) / p }

export default function W3ReadinessPage() {
  const navigate = useNavigate()
  const { data: snapshot } = useTodaySnapshot()
  const end = useMemo(() => new Date(), [])
  const start = useMemo(() => { const d = new Date(); d.setDate(d.getDate() - 30); return d }, [])
  const { data: metricsResp } = useDailyMetrics(start, end)
  const { data: adaptive } = useAdaptive()
  const { data: pmc } = usePMC(90)

  const vm = useMemo<W3ReadinessVm>(() => {
    const metrics = (metricsResp?.metrics ?? []).slice().sort((a, b) => (a.date ?? '').localeCompare(b.date ?? ''))
    const latest = metrics[metrics.length - 1] ?? null

    // ── canonical readiness (decision first, composite fallback) ──
    const fallback = computeReadiness(
      num(latest?.hrv_status ?? null),
      num(snapshot?.body_battery.now ?? latest?.body_battery ?? null),
      num(latest?.sleep_score ?? null),
    )
    const { score, tier } = canonicalReadiness(adaptive?.daily_decision?.readiness ?? null, fallback)
    const rtier = tier ?? readinessTier(score)
    const TIER_DE: Record<string, string> = { peak: 'Spitzenform', ready: 'Bereit', caution: 'Vorsicht', rest: 'Ruhen' }
    const tierLabel = rtier ? (TIER_DE[rtier] ?? null) : null
    const word = score == null ? null
      : score >= 80 ? 'Bereit für Leistung'
        : score >= 65 ? 'Gut erholt'
          : score >= 45 ? 'Solide'
            : score >= 30 ? 'Locker halten' : 'Ruhen'

    const guide = score == null
      ? { t: 'Warte auf Overnight-Daten', b: 'Sobald HRV, Schlaf und Ruhepuls der letzten Nacht da sind, erscheint hier deine Empfehlung.' }
      : score >= 70
        ? { t: 'Du bist bereit für Leistung', b: 'HRV und Ruhepuls sind im gesunden Bereich. Heute darf die Belastung höher liegen.' }
        : score >= 45
          ? { t: 'Moderat halten', b: 'Deine Erholung ist okay, aber nicht optimal — halte die Intensität im Zaum.' }
          : { t: 'Erholung geht vor', b: 'Deine Signale liegen unter deinem Schnitt. Locker fahren oder ruhen zahlt sich morgen aus.' }

    // ── drivers ──
    const baseline = (series: number[]): number | null => series.length >= 2 ? series.slice(0, -1).reduce((a, b) => a + b, 0) / (series.length - 1) : null
    const build = (
      icon: DriverIcon, label: string, unit: string,
      pick: (m: DailyMetric) => number | null | undefined,
      opts: { fmt?: (v: number) => string; goodHigher: boolean; fracOf: (v: number) => number; deltaFmt?: (d: number) => string },
    ): DriverVm => {
      const s = seriesOf(metrics, pick)
      const cur = s.length ? s[s.length - 1] : null
      const base = baseline(s)
      const d = cur != null && base != null ? cur - base : null
      const deltaGood = d == null || Math.abs(d) < 0.5 ? null : (d > 0 ? opts.goodHigher : !opts.goodHigher)
      const deltaFmt = opts.deltaFmt ?? ((x: number) => `${x > 0 ? '+' : ''}${round(x)}`)
      return {
        icon, label, unit,
        value: cur != null ? (opts.fmt ? opts.fmt(cur) : String(round(cur))) : '—',
        delta: d != null && Math.abs(d) >= 0.5 ? deltaFmt(d) : (cur != null ? 'stabil' : null),
        deltaGood,
        frac: cur != null ? Math.max(0.06, Math.min(1, opts.fracOf(cur))) : 0,
        spark: s.length ? normalize(s) : [],
      }
    }

    const drivers: DriverVm[] = [
      build('hrv', 'HRV', 'ms', (m) => m.hrv_status, { goodHigher: true, fracOf: (v) => v / 120 }),
      build('rhr', 'Ruhepuls', 'bpm', (m) => m.resting_hr, { goodHigher: false, fracOf: (v) => 1 - Math.min(1, (v - 38) / 42) }),
      build('sleep', 'Schlaf', 'h', (m) => (m.sleep_detail?.total_s != null ? m.sleep_detail.total_s / 3600 : (m.sleep_score != null ? m.sleep_score / 12.5 : null)),
        { goodHigher: true, fracOf: (v) => v / 9, fmt: (v) => `${Math.floor(v)}:${String(Math.round((v % 1) * 60)).padStart(2, '0')}`, deltaFmt: (x) => `${x > 0 ? '+' : '−'}${Math.floor(Math.abs(x))}:${String(Math.round((Math.abs(x) % 1) * 60)).padStart(2, '0')}` }),
      build('battery', 'Body Battery', '%', (m) => m.body_battery, { goodHigher: true, fracOf: (v) => v / 100 }),
      build('stress', 'Stress', '', (m) => m.stress_level, { goodHigher: false, fracOf: (v) => 1 - Math.min(1, v / 100) }),
      build('recovery', 'Erholung', 'h', (m) => m.recovery_time_hours, { goodHigher: false, fracOf: (v) => 1 - Math.min(1, v / 48) }),
    ]
    // Prefer the live snapshot for body battery when present (fresher than the daily row).
    if (snapshot?.body_battery.now != null) {
      const bb = drivers.find((x) => x.icon === 'battery')
      if (bb) { bb.value = String(round(snapshot.body_battery.now)); bb.frac = Math.max(0.06, Math.min(1, snapshot.body_battery.now / 100)) }
    }

    // ── 7-day readiness trend ──
    const trendRaw = metrics.slice(-7).map((m) => computeReadiness(num(m.hrv_status), num(m.body_battery), num(m.sleep_score)) ?? 0)
    const trend = trendRaw.some((v) => v > 0) ? trendRaw.map((v) => Math.max(0.06, v / 100)) : []

    // ── limiter ──
    const present = drivers.filter((x) => x.value !== '—')
    const worst = present.length ? present.reduce((m, x) => (x.frac < m.frac ? x : m), present[0]) : null
    const limiterNote = worst && worst.frac < 0.5 ? `${worst.label} begrenzt deine Bereitschaft heute am stärksten.` : null

    const dateNote = latest?.date
      ? `Overnight-Signale · Stand ${new Date(latest.date).toLocaleDateString('de-DE', { weekday: 'short', day: 'numeric', month: 'short' })}`
      : 'Overnight-Signale erscheinen nach der ersten Nacht mit deiner Uhr.'

    // ── sleep breakdown ──
    const sd = latest?.sleep_detail ?? null
    const sleep = sd && sd.total_s && sd.total_s > 0 ? (() => {
      const tot = sd.total_s as number
      const h = Math.floor(tot / 3600), m = Math.round((tot % 3600) / 60)
      const stage = (s: number | null, label: string, hue: string): SleepStage | null => (s != null && s > 0 ? { label, frac: s / tot, hue } : null)
      const stages = [stage(sd.deep_s, 'Tief', '#7B5CFF'), stage(sd.rem_s, 'REM', '#00E5FF'), stage(sd.light_s, 'Leicht', '#6B8CFF'), stage(sd.awake_s, 'Wach', '#FFB020')].filter((x): x is SleepStage => x != null)
      const deepPct = sd.deep_s != null ? Math.round((sd.deep_s / tot) * 100) : null
      return {
        total: `${h}:${String(m).padStart(2, '0')} h`,
        stages,
        spo2: sd.spo2_avg != null ? `${Math.round(sd.spo2_avg)}%` : null,
        resp: sd.respiration_avg != null ? `${Math.round(sd.respiration_avg)}/min Atmung` : null,
        note: deepPct != null ? `Tiefschlaf ${deepPct}% der Nacht — ${deepPct >= 13 ? 'solide Erholung.' : 'etwas knapp, beobachten.'}` : 'Schlafphasen aus deiner Uhr.',
      }
    })() : null

    // ── recovery ETA ──
    const recH = num(latest?.recovery_time_hours ?? null) ?? num(snapshot?.recovery_time_hours ?? null)
    const recovery = recH != null ? {
      hours: `${Math.round(recH)}h`,
      frac: Math.min(1, recH / 48),
      note: recH <= 6 ? 'Fast frisch — heute geht Belastung.' : recH <= 18 ? 'Noch etwas Erholung offen.' : 'Länger erholen, bevor es hart wird.',
    } : null

    // ── fitness / freshness (PMC) ──
    const pe = pmc?.entries ?? []
    const lastPmc = pe[pe.length - 1] ?? null
    const fitness = lastPmc ? {
      ctl: String(Math.round(lastPmc.ctl)),
      atl: String(Math.round(lastPmc.atl)),
      tsb: `${lastPmc.tsb >= 0 ? '+' : ''}${Math.round(lastPmc.tsb)}`,
      verdict: lastPmc.tsb >= 5 ? 'Frisch — die Form ist da.' : lastPmc.tsb >= -10 ? 'Im Trainingsbereich.' : 'Ermüdet — Form kommt nach der Erholung.',
    } : null

    const vo2 = num(latest?.vo2max ?? null) != null ? `${Math.round(latest!.vo2max as number)}` : null

    return { score, word, tierLabel, guidanceTitle: guide.t, guidanceBody: guide.b, dateNote, trend, drivers, limiterNote, sleep, recovery, fitness, vo2 }
  }, [metricsResp, snapshot, adaptive, pmc])

  return <W3ReadinessView vm={vm} onBack={() => navigate(-1)} />
}
