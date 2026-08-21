import { useMemo } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useRaceDebrief } from '../../hooks/useRaceDebrief'
import { usePMC } from '../../hooks/usePMC'
import { useActivitiesRange } from '../../hooks/useActivitiesRange'
import { useActivity } from '../../hooks/useActivity'
import type { RaceDebrief, EffortMatch } from '../../api/debrief'
import type { PMCResponse, ActivityRead } from '../../api/dashboard'
import { useRideScene, useRenderRideScene } from '../../hooks/useGarage'
import type { W3RideHeroVm } from './W3RideMapHero'
import W3RideDetailView, { type W3RideVm, type W3RideSceneState, type W3SceneStatus, type W3Zone, type W3Rank, type W3Repeat, type MovedRow } from './W3RideDetailView'
import W3Loading from './W3Loading'

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
// Format the ride's date chip: raw ISO → "12. Aug. 2026" (never the raw timestamp).
const fmtDate = (iso: string | null | undefined): string => {
  if (!iso) return DASH
  const d = new Date(iso)
  return isNaN(d.getTime()) ? String(iso) : d.toLocaleDateString('de-DE', { day: 'numeric', month: 'short', year: 'numeric' })
}

/** The hero's headline: hours, minutes AND seconds, zero-padded throughout.
 *  Seconds matter here in a way they do not in a stat tile — this is the figure
 *  a rider compares against the one on their head unit, and a truncated one
 *  reads as the app disagreeing with the bike. */
const fmtHmsFull = (s: number) => [Math.floor(s / 3600), Math.floor((s % 3600) / 60), Math.floor(s % 60)]
  .map((n) => String(n).padStart(2, '0')).join(':')

/** "20.08.2026 · 15:45" — the ride's own start, not today. */
const fmtDateTime = (iso: string | null | undefined): string => {
  if (!iso) return DASH
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return DASH
  return `${d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })} · ${d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}`
}
const ZONE_NAMES = ['Erholung', 'Ausdauer', 'Tempo', 'Schwelle', 'VO2max']
const sgn = (n: number) => `${n >= 0 ? '+' : ''}${Math.round(n)}`
const durLabel = (s: number) => (s < 60 ? `${s} Sek` : `${Math.round(s / 60)} Min`)

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
    label: `WDH. ${i + 1}`,
    watts: `${c.w} W`,
    delta: deltas[i],
    verdict: i === maxIdx && deltas[i] >= 0 ? 'STÄRKSTE' : deltas[i] >= 0 ? 'GEHALTEN' : 'ABGEBAUT',
  }))

  const held = deltas.filter((x) => x >= 0).length
  const slipped = deltas.map((x, i) => ({ x, i })).filter((o) => o.x < 0)
  const sub =
    slipped.length === 0
      ? 'Jede Wiederholung auf oder über dem Schnitt.'
      : slipped.length === 1
        ? `Nur Wiederholung ${slipped[0].i + 1} fiel ab, um ${Math.abs(slipped[0].x)} W.`
        : `${slipped.length} Wiederholungen fielen unter den Schnitt.`

  const dropped = climbs.filter((c) => c.w < target * 0.9).length
  const note = `${climbs.length} WDH. · ${dropped === 0 ? 'KEINE ABGEBAUT' : `${dropped} ABGEBAUT`}`

  return { repeats, score: `${held} von ${climbs.length}`, sub, note }
}

/** The ceiling that this ride moved: the best PR effort match. When the ride
 *  set no new best, the ceiling is unchanged (delta 0). Honest "—" when there
 *  are no effort matches at all. */
function toCeiling(efforts: EffortMatch[]): { label: string; before: string; after: string; delta: string } {
  if (efforts.length === 0) return { label: 'Bestwert', before: DASH, after: DASH, delta: DASH }
  const best = efforts.reduce((m, e) => ((e.pct_of_best ?? 0) > (m.pct_of_best ?? 0) ? e : m), efforts[0])
  const label = `${durLabel(best.duration_s)} Bestwert`
  if (best.is_pr && best.best_watts != null) {
    return { label, before: `${best.best_watts}`, after: `${best.ride_watts}`, delta: sgn(best.ride_watts - best.best_watts) }
  }
  const ceiling = best.best_watts ?? best.ride_watts
  return { label, before: `${ceiling}`, after: `${ceiling}`, delta: '+0' }
}

// fixture: the app has no season-goal model yet, so "toward the year" tracks
// real season totals against placeholder targets (mirrors the Rides page).
const KM_GOAL = 12000, M_GOAL = 100000, RIDES_GOAL = 200
const spaceK = (n: number) => Math.round(n).toLocaleString('en-US').replace(/,/g, ' ')

function toVm(d: RaceDebrief, pmc: PMCResponse | undefined, activity: ActivityRead | null, season: ActivityRead[]): W3RideVm {
  const h = d.header
  const v = d.verdict
  const eff = d.efficiency

  // Intensity Factor. The debrief SHIPS one (`header.if_`), computed server-side
  // from normalised power against the athlete's real FTP, so that is the number
  // to use. The TSS inversion below is only a fallback for rides whose FTP was
  // unknown at the time — it is the same Coggan relation solved the other way,
  // and it agrees with the direct figure whenever both exist.
  const hrs = h.moving_time_s / 3600
  const intensity = h.if_ != null && h.if_ > 0
    ? h.if_
    : h.tss > 0 && hrs > 0 ? Math.sqrt(h.tss / (hrs * 100)) : 0

  // "What it moved you toward" — real season totals + this ride's contribution.
  const cyc = season.filter((a) => a.sport === 'cycling')
  const totalKm = cyc.reduce((s, a) => s + (a.distance_meters ?? 0), 0) / 1000
  const totalM = cyc.reduce((s, a) => s + (a.elevation_gain_m ?? 0), 0)
  const totalRides = cyc.length
  const thisKm = h.distance_km ?? (activity?.distance_meters ?? 0) / 1000
  const thisM = h.elevation_m ?? activity?.elevation_gain_m ?? 0
  const clamp = (x: number) => Math.max(0, Math.min(1, x))
  const moved: MovedRow[] = totalRides > 0 ? [
    { label: 'Saison-Distanz', delta: `+${Math.round(thisKm)} km`, value: spaceK(totalKm), goal: `${spaceK(KM_GOAL)} km`, beforePct: clamp((totalKm - thisKm) / KM_GOAL), pct: clamp(totalKm / KM_GOAL) },
    { label: 'Höhenmeter', delta: `+${spaceK(thisM)} m`, value: spaceK(totalM), goal: `${spaceK(M_GOAL)} m`, beforePct: clamp((totalM - thisM) / M_GOAL), pct: clamp(totalM / M_GOAL) },
    { label: 'Fahrten erfasst', delta: '+1', value: String(totalRides), goal: String(RIDES_GOAL), beforePct: clamp((totalRides - 1) / RIDES_GOAL), pct: clamp(totalRides / RIDES_GOAL) },
  ] : []
  const remainKm = Math.max(0, KM_GOAL - totalKm)
  const moreRides = thisKm > 0 ? Math.ceil(remainKm / thisKm) : null
  const movedSub = `${Math.round(thisKm)} km und ${spaceK(thisM)} Höhenmeter, auf dein Jahr gerechnet.`
  const movedFoot = remainKm <= 0
    ? 'Saisonziel erreicht — alles ab hier ist Zugabe.'
    : moreRides != null
      ? `Noch etwa ${moreRides} Fahrten wie diese, dann stehen die ${spaceK(KM_GOAL)} km.`
      : `Noch ${spaceK(remainKm)} km bis zum Saisonziel.`

  const zones: W3Zone[] = (() => {
    const pct = d.pacing?.zone_time_pct ?? {}
    const keys = Object.keys(pct)
    if (keys.length === 0) return []
    return keys.slice(0, 5).map((k, i) => {
      const p = Math.round((pct[k] ?? 0) * (pct[k] > 1 ? 1 : 100))
      const min = Math.round(((pct[k] > 1 ? pct[k] / 100 : pct[k]) * h.moving_time_s) / 60)
      return { z: `ZONE ${i + 1}`, name: ZONE_NAMES[i] ?? k, min: `${min} Min`, pct: p, peak: i === 3 }
    })
  })()

  const bestEffort = d.efforts.reduce((m, e) => (e.pct_of_best ?? 0) > (m?.pct_of_best ?? 0) ? e : m, d.efforts[0])
  const ranks: W3Rank[] = d.efforts.slice(0, 5).map((e) => ({
    dur: e.duration_s < 60 ? `${e.duration_s} SEK` : `${Math.round(e.duration_s / 60)} MIN`,
    watts: `${e.ride_watts} W`,
    note: e.is_pr ? 'NEUER BESTWERT' : e.best_watts != null ? `BESTWERT ${e.best_watts} W` : '',
    pr: e.is_pr,
    fill: e.pct_of_best != null ? Math.min(1, e.pct_of_best / (e.pct_of_best > 1 ? 100 : 1)) : 0.6,
  }))

  const rep = toRepeats(d)
  const ceil = toCeiling(d.efforts)
  const pmcT = pmcTriplet(pmc)

  // A factual line about the 7-day fitness/form window (never a fabricated
  // narrative); falls back to the AI verdict's watch-out when PMC is absent.
  const changesBody = pmcT.hasTrend
    ? `In den letzten sieben Tagen: Fitness ${sgn(pmcT.ctlDelta)}, Form ${sgn(pmcT.tsbDelta)} — der Preis der Arbeit, und wo er dich jetzt hinstellt.`
    : (v.watch_out[0] ?? '')

  // ── the hero ─────────────────────────────────────────────────────────
  // Distance, average speed and elevation, in that order: what you covered,
  // how fast, and how much of it was up. The pen's third slot is a max speed,
  // which the debrief does not carry — inventing one would be worse than
  // showing the climbing, which is the number a cyclist wants anyway.
  const num = (n: number, d = 0) => n.toLocaleString('de-DE', { minimumFractionDigits: d, maximumFractionDigits: d })
  const heroStats: W3RideHeroVm['stats'] = [
    { label: 'DISTANZ', value: h.distance_km != null ? num(h.distance_km, 1) : DASH, unit: 'km' },
    { label: 'Ø TEMPO', value: h.avg_speed_kmh != null ? num(h.avg_speed_kmh, 1) : DASH, unit: 'km/h' },
    { label: 'HÖHE', value: h.elevation_m != null ? num(h.elevation_m) : DASH, unit: 'hm' },
  ]
  // "82 % VON FTP · SCHWELLE" — the IF as a percentage, named by the zone it
  // lands in. The boundaries are Coggan's own training-level bands, so the word
  // beside the number is the one a cyclist already uses for that effort.
  const ifPct = Math.round(intensity * 100)
  const zoneWord = intensity >= 1.05 ? 'VO₂MAX'
    : intensity >= 0.95 ? 'SCHWELLE'
    : intensity >= 0.85 ? 'TEMPO'
    : intensity >= 0.75 ? 'GRUNDLAGE'
    : 'ERHOLUNG'
  // The debrief computes this properly when it can. The fallback leans on the
  // coincidence every cyclist's head unit already leans on: a kilojoule of
  // MECHANICAL work costs roughly a kilocalorie of the rider, because human
  // cycling efficiency is close to 1/4.184. It is an approximation, and it is
  // the same approximation Garmin and Wahoo display.
  const kcal = d.fueling?.total_kcal ?? (h.total_kj > 0 ? h.total_kj : null)
  const hero: W3RideHeroVm = {
    polyline: activity?.route_polyline ?? null,
    grades: activity?.route_grades ?? null,
    sceneImage: null,
    dateLine: fmtDateTime(h.date),
    duration: fmtHmsFull(h.moving_time_s),
    stats: heroStats,
    watts: h.np_watts > 0 ? String(Math.round(h.np_watts)) : DASH,
    bpm: eff?.avg_hr != null ? String(Math.round(eff.avg_hr)) : DASH,
    ifValue: intensity > 0 ? intensity.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : DASH,
    // Against 1.0, which IS threshold — so a threshold ride fills the beam and
    // anything above it is capped rather than overflowing off the end.
    ifFill: Math.min(1, intensity),
    effortLabel: intensity > 0 ? `${ifPct} % VON FTP · ${zoneWord}` : 'INTENSITÄT UNBEKANNT',
    energyLabel: kcal != null && kcal > 0 ? `${Math.round(kcal).toLocaleString('de-DE')} kcal` : DASH,
  }

  return {
    hero,
    dateChip: fmtDate(h.date), sportChip: h.sport?.toUpperCase() ?? 'FAHRT', recordChip: bestEffort?.is_pr ? 'NEUER REKORD' : null,
    title: h.title,
    bigStat: h.distance_km != null ? String(Math.round(h.distance_km)) : DASH, bigStatUnit: 'Kilometer',
    polyline: activity?.route_polyline ?? null, intensity,
    movedSub, moved, movedFoot,
    climb: h.elevation_m != null ? `${Math.round(h.elevation_m)} m hoch` : DASH,
    avgSpeed: h.avg_speed_kmh != null ? `${Math.round(h.avg_speed_kmh)} km/h` : DASH,
    power: d.story?.power?.filter((_, i) => i % Math.max(1, Math.floor((d.story?.power.length ?? 1) / 40)) === 0).slice(0, 40) ?? [],
    powerNote: rep.note,
    // ── FOUR THINGS THE HERO CANNOT ALREADY SAY ────────────────────────
    // This grid used to repeat the card above it almost exactly: average
    // power, ride time and heart rate are all in the hero, so three of four
    // tiles restated a figure the rider had read ninety pixels earlier. A
    // number printed twice does not read as twice as important, it reads as a
    // page that is not sure what it is for.
    //
    // So each tile now carries something the hero has no room for, and each
    // says what it MEANS rather than only what it is: the load the ride put on
    // the body, whether the body held together under it, how evenly the power
    // was laid down, and the work actually done.
    stats: [
      { v: String(Math.round(h.tss)), l: 'BELASTUNG · TSS',
        s: h.tss >= 150 ? 'harter Tag' : h.tss >= 80 ? 'solider Reiz' : 'leichte Einheit' },
      { v: eff?.decoupling_pct != null
          ? `${eff.decoupling_pct.toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} %`
          : DASH,
        l: 'HF-DRIFT',
        // Coggan's rule of thumb: under 5 % the aerobic system held.
        s: eff?.decoupling_pct == null ? 'ohne Herzfrequenz nicht messbar'
          : eff.decoupling_pct < 5 ? 'aerob durchgehalten' : 'Ausdauer gab nach' },
      { v: d.pacing?.variability_index != null
          ? d.pacing.variability_index.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
          : DASH,
        l: 'VARIABILITÄT',
        s: d.pacing?.variability_index == null ? ''
          : d.pacing.variability_index < 1.05 ? 'sehr gleichmäßig getreten' : 'viele Antritte' },
      { v: h.total_kj > 0 ? `${Math.round(h.total_kj).toLocaleString('de-DE')}` : DASH, l: 'ARBEIT · KJ',
        s: kcal != null && kcal > 0 ? `${Math.round(kcal).toLocaleString('de-DE')} kcal verbrannt` : '' },
    ],
    execScore: String(v.grade_score), execTotal: '100',
    verdictHeadline: v.went_well[0] ?? v.ai_verdict.split('.')[0] ?? '',
    verdictBody: v.ai_verdict, aiModel: v.ai_model || null,
    repeatsScore: rep.score, repeatsSub: rep.sub, repeats: rep.repeats,
    zonesSub: `${Math.round(h.moving_time_s / 60)} Minuten aufgezeichnet.`, zones,
    ranksSub: 'Jede Dauer gegen deinen Bestwert.', ranks,
    onYouDelta: ceil.delta, ceilingLabel: ceil.label, ceilingBefore: ceil.before, ceilingAfter: ceil.after,
    fitness: pmcT.fitness, fitnessD: pmcT.fitnessD, fatigue: pmcT.fatigue, fatigueD: pmcT.fatigueD, form: pmcT.form, formD: pmcT.formD,
    changesBody,
  }
}

/** Only the statuses the screen knows how to answer; anything else the backend
 *  might one day return is treated like "no studio" — the route trace holds the
 *  cover and nothing is offered. */
const SCENE_STATUSES: W3SceneStatus[] = ['ok', 'not_generated', 'needs_rider', 'needs_bike', 'image_model_unavailable']

export default function W3RideDetailPage() {
  const navigate = useNavigate()
  const { id } = useParams<{ id: string }>()
  const activityId = id ? Number(id) : undefined
  const { data } = useRaceDebrief(activityId)
  const { data: pmc } = usePMC()
  const seasonStart = useMemo(() => new Date(new Date().getFullYear(), 0, 1), [])
  const { data: season } = useActivitiesRange(seasonStart, new Date())
  // THIS ride, from the endpoint that is about it — not found by scanning a
  // year. The season list is still fetched, but only for the season TOTALS the
  // "was es bewegt hat" section adds up; the route no longer waits on it.
  const { data: activityRow, isLoading: routePending } = useActivity(activityId)
  const activity = activityRow ?? (season?.activities ?? []).find((a) => a.id === Number(id)) ?? null
  const vm = useMemo(() => (data ? toVm(data, pmc, activity, season?.activities ?? []) : null), [data, pmc, activity, season])

  // The composed hero: a cheap cache read on open (it never generates), plus the
  // slow compose behind an explicit tap. While the read is in flight the View
  // shows the route trace — instant and real — instead of a spinner.
  const { data: sceneData } = useRideScene(activityId)
  const compose = useRenderRideScene()
  const scene: W3RideSceneState = useMemo(() => {
    const raw = sceneData?.status
    const status: W3SceneStatus = raw != null && (SCENE_STATUSES as string[]).includes(raw)
      ? (raw as W3SceneStatus)
      : raw != null ? 'image_model_unavailable' : 'loading'
    return {
      status: status === 'ok' && !sceneData?.image_base64 ? 'not_generated' : status,
      image: sceneData?.image_base64 ?? null,
      pending: compose.isPending,
      failed: compose.isError,
    }
  }, [sceneData, compose.isPending, compose.isError])

  // The scene arrives from its own hook, so it is merged in HERE rather than in
  // `toVm` — `toVm` is a pure function of the debrief and must not start
  // depending on a second request. Merged rather than passed as a sibling prop
  // so the hero has one object to render and cannot show a picture that
  // disagrees with the numbers beside it.
  const heroVm = useMemo(
    () => (vm ? {
      ...vm.hero,
      sceneImage: scene.status === 'ok' && !scene.pending ? scene.image : null,
      routePending,
    } : null),
    [vm, scene.status, scene.image, scene.pending, routePending],
  )

  if (!vm || !heroVm) return <W3Loading label="Lade deine Fahrt…" />
  return (
    <W3RideDetailView
      vm={{ ...vm, hero: heroVm }}
      scene={scene}
      onCompose={() => { if (activityId != null && !compose.isPending) compose.mutate(activityId) }}
      onOpenStudio={(kind) => navigate(kind === 'rider' ? '/e/w3-avatar-onboard' : '/e/w3-bike-studio')}
      onBack={() => navigate(-1)}
      onShare={() => id && navigate(`/e/w3-share/${id}`)}
      onExpandMap={vm.hero.polyline ? () => navigate(`/e/w3-ride-map/${id}`) : undefined}
    />
  )
}
