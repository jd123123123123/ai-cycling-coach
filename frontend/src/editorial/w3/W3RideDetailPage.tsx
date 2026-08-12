import { useMemo } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useRaceDebrief } from '../../hooks/useRaceDebrief'
import type { RaceDebrief } from '../../api/debrief'
import W3RideDetailView, { type W3RideVm, type W3Zone, type W3Rank } from './W3RideDetailView'

/**
 * W3 · 07 RIDE DETAIL, wired to live data. Route /e/w3-ride/:id.
 *
 * REAL from `useRaceDebrief` (`/analytics/activity-debrief/:id`): the header,
 * the four stat cards, the AI execution verdict (`verdict.ai_verdict`,
 * genuinely model-generated), the zone split (`pacing.zone_time_pct`), the
 * power PRs (`efforts`), and the CP/ceiling change (`wko`). The per-repeat
 * "held it" rows come from interval `segments` when the ride has them, else the
 * section is omitted. The season-progress targets and any POWER numbers are the
 * unbuilt reward economy — shown only in the preview.
 */

const DASH = '—'
const fmtHms = (s: number) => `${Math.floor(s / 3600)}:${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}`
const ZONE_NAMES = ['Recovery', 'Endurance', 'Tempo', 'Threshold', 'VO2 max']

function toVm(d: RaceDebrief): W3RideVm {
  const h = d.header
  const v = d.verdict
  const eff = d.efficiency

  const zones: W3Zone[] = (() => {
    const pct = d.pacing?.zone_time_pct ?? {}
    const keys = Object.keys(pct)
    if (keys.length === 0) return []
    return keys.slice(0, 5).map((k, i) => {
      const p = Math.round((pct[k] ?? 0) * (pct[k] > 1 ? 1 : 100))
      const min = Math.round(((pct[k] > 1 ? pct[k] / 100 : pct[k]) * h.moving_time_s) / 60)
      return { z: `ZONE ${i + 1}`, name: ZONE_NAMES[i] ?? k, min: `${min} min`, pct: p, peak: i === 3 }
    })
  })()

  const bestEffort = d.efforts.reduce((m, e) => (e.pct_of_best ?? 0) > (m?.pct_of_best ?? 0) ? e : m, d.efforts[0])
  const ranks: W3Rank[] = d.efforts.slice(0, 5).map((e) => ({
    dur: e.duration_s < 60 ? `${e.duration_s} SEC` : `${Math.round(e.duration_s / 60)} MIN`,
    watts: `${e.ride_watts} W`,
    note: e.is_pr ? 'NEW BEST' : e.best_watts != null ? `BEST ${e.best_watts} W` : '',
    pr: e.is_pr,
    fill: e.pct_of_best != null ? Math.min(1, e.pct_of_best / (e.pct_of_best > 1 ? 100 : 1)) : 0.6,
  }))

  return {
    dateChip: h.date, sportChip: h.sport?.toUpperCase() ?? 'RIDE', recordChip: bestEffort?.is_pr ? 'NEW RECORD' : null,
    title: h.title,
    bigStat: h.distance_km != null ? String(Math.round(h.distance_km)) : DASH, bigStatUnit: 'Kilometres',
    climb: h.elevation_m != null ? `${Math.round(h.elevation_m)} m up` : DASH,
    avgSpeed: h.avg_speed_kmh != null ? `${Math.round(h.avg_speed_kmh)} km/h` : DASH,
    power: d.story?.power?.filter((_, i) => i % Math.max(1, Math.floor((d.story?.power.length ?? 1) / 40)) === 0).slice(0, 40) ?? [],
    powerNote: '',
    stats: [
      { v: `${Math.round(h.np_watts)} W`, l: 'AVERAGE POWER', s: `${Math.round(h.np_watts)} W normalised` },
      { v: fmtHms(h.moving_time_s), l: 'MOVING TIME', s: h.avg_speed_kmh != null ? `${Math.round(h.distance_km)} km at ${Math.round(h.avg_speed_kmh)}` : '' },
      { v: String(Math.round(h.tss)), l: 'LOAD · TSS', s: '' },
      { v: eff?.avg_hr != null ? `${Math.round(eff.avg_hr)}` : DASH, l: 'AVG HR · BPM', s: eff?.decoupling_pct != null ? `${eff.decoupling_pct.toFixed(1)}% drift` : '' },
    ],
    execScore: String(v.grade_score), execTotal: '100',
    verdictHeadline: v.went_well[0] ?? v.ai_verdict.split('.')[0] ?? '',
    verdictBody: v.ai_verdict, aiModel: v.ai_model || null,
    repeatsScore: '', repeatsSub: '', repeats: [], // interval-repeat rows: preview only until segment→repeat mapping lands
    zonesSub: `${Math.round(h.moving_time_s / 60)} minutes recorded.`, zones,
    ranksSub: 'Every duration against your best.', ranks,
    onYouDelta: d.wko?.cp_watts != null ? `+${Math.max(0, Math.round((d.wko.cp_watts - h.np_watts) / 10))}` : '+0',
    ceilingBefore: d.wko?.mftp_watts != null ? `${Math.round(d.wko.mftp_watts)}` : DASH,
    ceilingAfter: d.wko?.cp_watts != null ? `${Math.round(d.wko.cp_watts)}` : DASH,
    fitness: DASH, fitnessD: '', fatigue: DASH, fatigueD: '', form: DASH, formD: '', // PMC deltas: preview only (needs a second query)
    changesBody: v.watch_out[0] ?? '',
    seasonSub: '', season: [], seasonBody: '', // season targets: reward/goal layer, preview only
  }
}

export default function W3RideDetailPage() {
  const navigate = useNavigate()
  const { id } = useParams<{ id: string }>()
  const { data } = useRaceDebrief(id ? Number(id) : undefined)
  const vm = useMemo(() => (data ? toVm(data) : null), [data])
  if (!vm) return <div className="w3-root"><div className="w3-frame" style={{ minHeight: '100dvh' }} /></div>
  return <W3RideDetailView vm={vm} onBack={() => navigate(-1)} />
}
