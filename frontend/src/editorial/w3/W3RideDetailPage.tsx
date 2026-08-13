import { useMemo } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useRaceDebrief } from '../../hooks/useRaceDebrief'
import { usePMC } from '../../hooks/usePMC'
import type { RaceDebrief, EffortMatch } from '../../api/debrief'
import type { PMCResponse } from '../../api/dashboard'
import W3RideDetailView, { type W3RideVm, type W3Zone, type W3Rank, type W3Repeat } from './W3RideDetailView'

/**
 * W3 · 07 RIDE DETAIL, wired to live data. Route /e/w3-ride/:id.
 *
 * REAL from `useRaceDebrief` (`/analytics/activity-debrief/:id`): the header,
 * the four stat cards, the AI execution verdict (`verdict.ai_verdict`,
 * genuinely model-generated), the zone split (`pacing.zone_time_pct`), the
 * power PRs (`efforts`), and the 5-min ceiling change (best PR effort). The
 * per-repeat "held it" rows come from the ride's climb `segments` — this is a
 * hill-repeat ride, so each climb is a repeat, judged against the set's
 * average holding power; the section is omitted when the ride has no
 * repeatable climbs. REAL from `usePMC` (`/training-load/pmc`): fitness /
 * fatigue / form (CTL / ATL / TSB) and their 7-day trend. Absent signals show
 * an honest "—". No fabricated stats remain (the old placeholder season-goal
 * card was removed — it had no backing data source).
 */

const DASH = '—'
// Format the ride's date chip: raw ISO → "12 Aug 2026" (never the raw timestamp).
const fmtDate = (iso: string | null | undefined): string => {
  if (!iso) return DASH
  const d = new Date(iso)
  return isNaN(d.getTime()) ? String(iso) : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}
const fmtHms = (s: number) => `${Math.floor(s / 3600)}:${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}`
const ZONE_NAMES = ['Recovery', 'Endurance', 'Tempo', 'Threshold', 'VO2 max']
const sgn = (n: number) => `${n >= 0 ? '+' : ''}${Math.round(n)}`
const durLabel = (s: number) => (s < 60 ? `${s} sec` : `${Math.round(s / 60)} min`)

/** Fitness / fatigue / form from the PMC series: latest CTL/ATL/TSB plus the
 *  7-day change. Honest "—" when the series is missing or too short. */
function pmcTriplet(pmc: PMCResponse | undefined) {
  const e = pmc?.entries ?? []
  if (e.length === 0) {
    return { fitness: DASH, fitnessD: '', fatigue: DASH, fatigueD: '', form: DASH, formD: '', hasTrend: false, ctlDelta: 0, tsbDelta: 0 }
  }
  const last = e[e.length - 1]
  const prev = e.length > 7 ? e[e.length - 8] : null
  const ctlDelta = prev ? last.ctl - prev.ctl : 0
  const atlDelta = prev ? last.atl - prev.atl : 0
  const tsbDelta = prev ? last.tsb - prev.tsb : 0
  return {
    fitness: String(Math.round(last.ctl)), fitnessD: prev ? sgn(ctlDelta) : '',
    fatigue: String(Math.round(last.atl)), fatigueD: prev ? sgn(atlDelta) : '',
    form: sgn(last.tsb), formD: prev ? sgn(tsbDelta) : '',
    hasTrend: !!prev, ctlDelta, tsbDelta,
  }
}

/** The ride's climb segments read as hill repeats, each judged against the
 *  set's average holding power. Returns an empty list when the ride has fewer
 *  than two repeatable climbs, so the section is hidden. */
function toRepeats(d: RaceDebrief): { repeats: W3Repeat[]; score: string; sub: string; note: string } {
  const climbs = d.segments
    .filter((s) => s.kind === 'climb' && s.avg_power != null && s.duration_s >= 60)
    .map((s) => ({ w: Math.round(s.avg_power as number), dur: s.duration_s }))
  if (climbs.length < 2) return { repeats: [], score: '', sub: '', note: '' }

  const target = Math.round(climbs.reduce((a, c) => a + c.w, 0) / climbs.length)
  const deltas = climbs.map((c) => c.w - target)
  const maxIdx = deltas.reduce((mi, dlt, i) => (dlt > deltas[mi] ? i : mi), 0)

  const repeats: W3Repeat[] = climbs.map((c, i) => ({
    label: `REPEAT ${i + 1}`,
    watts: `${c.w} W`,
    delta: deltas[i],
    verdict: i === maxIdx && deltas[i] >= 0 ? 'STRONGEST' : deltas[i] >= 0 ? 'HELD' : 'FADED',
  }))

  const held = deltas.filter((x) => x >= 0).length
  const slipped = deltas.map((x, i) => ({ x, i })).filter((o) => o.x < 0)
  const sub =
    slipped.length === 0
      ? 'Every repeat on or above the set average.'
      : slipped.length === 1
        ? `Only repeat ${slipped[0].i + 1} slipped, by ${Math.abs(slipped[0].x)} W.`
        : `${slipped.length} repeats slipped below the set average.`

  const dropped = climbs.filter((c) => c.w < target * 0.9).length
  const note = `${climbs.length} REPEATS · ${dropped === 0 ? 'NONE DROPPED' : `${dropped} DROPPED`}`

  return { repeats, score: `${held} of ${climbs.length}`, sub, note }
}

/** The ceiling that this ride moved: the best PR effort match. When the ride
 *  set no new best, the ceiling is unchanged (delta 0). Honest "—" when there
 *  are no effort matches at all. */
function toCeiling(efforts: EffortMatch[]): { label: string; before: string; after: string; delta: string } {
  if (efforts.length === 0) return { label: 'Power ceiling', before: DASH, after: DASH, delta: DASH }
  const best = efforts.reduce((m, e) => ((e.pct_of_best ?? 0) > (m.pct_of_best ?? 0) ? e : m), efforts[0])
  const label = `${durLabel(best.duration_s)} ceiling`
  if (best.is_pr && best.best_watts != null) {
    return { label, before: `${best.best_watts}`, after: `${best.ride_watts}`, delta: sgn(best.ride_watts - best.best_watts) }
  }
  const ceiling = best.best_watts ?? best.ride_watts
  return { label, before: `${ceiling}`, after: `${ceiling}`, delta: '+0' }
}

function toVm(d: RaceDebrief, pmc: PMCResponse | undefined): W3RideVm {
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

  const rep = toRepeats(d)
  const ceil = toCeiling(d.efforts)
  const pmcT = pmcTriplet(pmc)

  // A factual line about the 7-day fitness/form window (never a fabricated
  // narrative); falls back to the AI verdict's watch-out when PMC is absent.
  const changesBody = pmcT.hasTrend
    ? `Over the last seven days fitness moved ${sgn(pmcT.ctlDelta)} and form ${sgn(pmcT.tsbDelta)} — the cost of the work, and where it leaves you now.`
    : (v.watch_out[0] ?? '')

  return {
    dateChip: fmtDate(h.date), sportChip: h.sport?.toUpperCase() ?? 'RIDE', recordChip: bestEffort?.is_pr ? 'NEW RECORD' : null,
    title: h.title,
    bigStat: h.distance_km != null ? String(Math.round(h.distance_km)) : DASH, bigStatUnit: 'Kilometres',
    climb: h.elevation_m != null ? `${Math.round(h.elevation_m)} m up` : DASH,
    avgSpeed: h.avg_speed_kmh != null ? `${Math.round(h.avg_speed_kmh)} km/h` : DASH,
    power: d.story?.power?.filter((_, i) => i % Math.max(1, Math.floor((d.story?.power.length ?? 1) / 40)) === 0).slice(0, 40) ?? [],
    powerNote: rep.note,
    stats: [
      { v: `${Math.round(h.np_watts)} W`, l: 'AVERAGE POWER', s: `${Math.round(h.np_watts)} W normalised` },
      { v: fmtHms(h.moving_time_s), l: 'MOVING TIME', s: h.avg_speed_kmh != null ? `${Math.round(h.distance_km)} km at ${Math.round(h.avg_speed_kmh)}` : '' },
      { v: String(Math.round(h.tss)), l: 'LOAD · TSS', s: '' },
      { v: eff?.avg_hr != null ? `${Math.round(eff.avg_hr)}` : DASH, l: 'AVG HR · BPM', s: eff?.decoupling_pct != null ? `${eff.decoupling_pct.toFixed(1)}% drift` : '' },
    ],
    execScore: String(v.grade_score), execTotal: '100',
    verdictHeadline: v.went_well[0] ?? v.ai_verdict.split('.')[0] ?? '',
    verdictBody: v.ai_verdict, aiModel: v.ai_model || null,
    repeatsScore: rep.score, repeatsSub: rep.sub, repeats: rep.repeats,
    zonesSub: `${Math.round(h.moving_time_s / 60)} minutes recorded.`, zones,
    ranksSub: 'Every duration against your best.', ranks,
    onYouDelta: ceil.delta, ceilingLabel: ceil.label, ceilingBefore: ceil.before, ceilingAfter: ceil.after,
    fitness: pmcT.fitness, fitnessD: pmcT.fitnessD, fatigue: pmcT.fatigue, fatigueD: pmcT.fatigueD, form: pmcT.form, formD: pmcT.formD,
    changesBody,
  }
}

export default function W3RideDetailPage() {
  const navigate = useNavigate()
  const { id } = useParams<{ id: string }>()
  const { data } = useRaceDebrief(id ? Number(id) : undefined)
  const { data: pmc } = usePMC()
  const vm = useMemo(() => (data ? toVm(data, pmc) : null), [data, pmc])
  if (!vm) return <div className="w3-root"><div className="w3-frame" style={{ minHeight: '100dvh' }} /></div>
  return <W3RideDetailView vm={vm} onBack={() => navigate(-1)} />
}
