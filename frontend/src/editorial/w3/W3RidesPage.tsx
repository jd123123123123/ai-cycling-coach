import { useMemo } from 'react'
import { useActivitiesRange } from '../../hooks/useActivitiesRange'
import { useAthleteProfile } from '../../hooks/useAthleteProfile'
import W3RidesView, { type W3RidesVm, type W3RideCard } from './W3RidesView'

/**
 * W3 · 08 RIDES ("Rides"), wired to live data. Route /e/w3-rides.
 *
 * REAL: the logged-rides count, the season distance total, the monthly-distance
 * bar chart, the AVG SPEED / AVG POWER / SADDLE TIME footer, and every ride card
 * come from `useActivitiesRange` over the trailing 12 months (cycling only).
 * Honest "—" wherever a field is missing. The GOAL / OF-GOAL / KM-TO-GO /
 * AHEAD-OF-PACE block exists ONLY when the rider has set their own season goal
 * (`goals.season_km_goal` on the profile) — the old hardcoded 12 000 km told
 * a brand-new rider they were thousands of km "HINTER PLAN" against a target
 * they never chose.
 */

/** "4 812" — thin-spaced thousands, matching the pen. */
const spaced = (n: number) => Math.round(n).toLocaleString('en-US').replace(/,/g, ' ')

/** "DI 12 AUG" */
function dateLabel(d: Date): string {
  const wd = d.toLocaleDateString('de-DE', { weekday: 'short' }).replace('.', '').toUpperCase()
  const mo = d.toLocaleDateString('de-DE', { month: 'short' }).replace('.', '').toUpperCase()
  return `${wd} ${String(d.getDate()).padStart(2, '0')} ${mo}`
}

/** seconds → "H:MM" */
function hm(sec: number): string {
  const h = Math.floor(sec / 3600)
  const m = Math.round((sec % 3600) / 60)
  return `${h}:${String(m).padStart(2, '0')}`
}

const RACE_RE = /\brace\b|\bcrit\b|gran ?fondo|\btt\b|time ?trial|\brr\b/i

export default function W3RidesPage() {
  const now = new Date()
  const start = new Date(now.getFullYear(), now.getMonth() - 11, 1) // trailing 12 months
  const { data } = useActivitiesRange(start, now)
  const { data: profile } = useAthleteProfile()
  const goalKm = profile?.goals?.season_km_goal ?? null

  const vm = useMemo<W3RidesVm>(() => {
    const acts = (data?.activities ?? [])
      .filter((a) => a.sport === 'cycling')
      .slice()
      .sort((a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime())

    // ── Season aggregates (real) ──────────────────────────────────────────────
    const totalDistM = acts.reduce((s, a) => s + (a.distance_meters ?? 0), 0)
    const totalSec = acts.reduce((s, a) => s + (a.duration_seconds ?? 0), 0)
    const totalKm = totalDistM / 1000

    // duration-weighted average speed / power over rides that carry the field
    let movingSec = 0, distForSpeed = 0, pWeighted = 0, pSec = 0
    for (const a of acts) {
      const dur = a.duration_seconds ?? 0
      if (dur > 0 && a.distance_meters) { movingSec += dur; distForSpeed += a.distance_meters }
      const pw = a.average_power ?? a.normalized_power
      if (dur > 0 && pw != null) { pWeighted += pw * dur; pSec += dur }
    }
    const avgSpeed = movingSec > 0 ? `${((distForSpeed / movingSec) * 3.6).toFixed(1)}` : '—'
    const avgPower = pSec > 0 ? `${Math.round(pWeighted / pSec)}` : '—'
    const saddleTime = totalSec > 0 ? hm(totalSec) : '—'

    // ── A record that just fell gets ANNOUNCED ────────────────────────────────
    // The archive is where a rider goes to be told they got better, and it
    // used to change a static row silently. Window-honest: computed over the
    // same trailing 12 months the page shows, announced only within 7 days of
    // the ride, and only once there are enough rides for "record" to mean
    // something (a third ride is always somebody's best).
    const prAnnounce = (() => {
      if (acts.length < 10) return null
      const week = 7 * 864e5
      const fresh = (a: (typeof acts)[number]) => now.getTime() - new Date(a.started_at).getTime() <= week
      let best: { title: string; sub: string; id: number } | null = null
      const longest = acts.reduce((m, a) => ((a.distance_meters ?? 0) > (m?.distance_meters ?? 0) ? a : m), acts[0])
      if (longest?.distance_meters && fresh(longest)) {
        best = {
          title: 'Neuer Bestwert · Längste Fahrt',
          sub: `${(longest.distance_meters / 1000).toFixed(1)} km — weiter als je in den letzten 12 Monaten.`,
          id: longest.id,
        }
      }
      const climb = acts.reduce((m, a) => ((a.elevation_gain_m ?? 0) > (m?.elevation_gain_m ?? 0) ? a : m), acts[0])
      if (!best && climb?.elevation_gain_m && fresh(climb)) {
        best = {
          title: 'Neuer Bestwert · Meiste Höhenmeter',
          sub: `${Math.round(climb.elevation_gain_m).toLocaleString('de-DE')} hm an einem Tag — Jahresbestwert.`,
          id: climb.id,
        }
      }
      const fastest = acts.reduce((m, a) => {
        const v = a.distance_meters && a.duration_seconds ? a.distance_meters / a.duration_seconds : 0
        const mv = m && m.distance_meters && m.duration_seconds ? m.distance_meters / m.duration_seconds : 0
        return v > mv ? a : m
      }, acts[0])
      if (!best && fastest?.distance_meters && fastest.duration_seconds
          && (fastest.distance_meters / 1000) >= 20 && fresh(fastest)) {
        best = {
          title: 'Neuer Bestwert · Schnellste Fahrt',
          sub: `${((fastest.distance_meters / fastest.duration_seconds) * 3.6).toFixed(1)} km/h über ${(fastest.distance_meters / 1000).toFixed(0)} km — Jahresbestwert.`,
          id: fastest.id,
        }
      }
      return best
    })()

    // ── Monthly distance bars (real) — trailing 12 months, oldest → newest ────
    const buckets = new Array(12).fill(0) as number[]
    for (const a of acts) {
      const d = new Date(a.started_at)
      const idx = (d.getFullYear() - now.getFullYear()) * 12 + (d.getMonth() - now.getMonth()) + 11
      if (idx >= 0 && idx < 12) buckets[idx] += (a.distance_meters ?? 0) / 1000
    }
    const maxBar = Math.max(1, ...buckets)
    const bars = buckets.map((b) => b / maxBar)
    // The bars are normalised for drawing, but a bar you can TAP has to be able
    // to say what it is. Its real kilometres and its own month name ride along
    // rather than being reverse-engineered from a 0..1 height at the call site.
    const barMonths = buckets.map((km, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - (11 - i), 1)
      return {
        km,
        label: d.toLocaleDateString('de-DE', { month: 'short' }).replace('.', ''),
        year: d.getFullYear(),
      }
    })

    // ── Goal tracking — ONLY against the rider's own target ──────────────────
    const dayOfYear = Math.floor((now.getTime() - new Date(now.getFullYear(), 0, 0).getTime()) / 864e5)
    const expected = goalKm != null ? goalKm * (dayOfYear / 365) : 0
    const paceDelta = totalKm - expected
    const paceAhead = paceDelta >= 0
    const firstRide = acts.at(-1)
    const activeDays = firstRide
      ? Math.max(30, Math.min(365, Math.round((now.getTime() - new Date(firstRide.started_at).getTime()) / 864e5) + 1))
      : 365
    const projectedKm = goalKm != null
      ? Math.round((totalKm / activeDays * 365) / 10) * 10
      : 0
    const realityLabel = goalKm == null ? ''
      : projectedKm >= goalKm ? 'Auf Kurs'
      : projectedKm >= goalKm * .85 ? 'Machbar mit kleinem Schub'
      : 'Noch ambitioniert'
    const goal = goalKm != null
      ? {
          chip: `ZIEL ${spaced(goalKm)} KM`,
          ofGoalPct: `${Math.round(Math.min(1, totalKm / goalKm) * 100)}%`,
          progress: Math.min(1, totalKm / goalKm),
          currentKm: Math.round(totalKm),
          targetKm: Math.round(goalKm),
          projectedKm,
          realityLabel,
          projectionLabel: `Hochrechnung · ${spaced(projectedKm)} km`,
          toGoLabel: `NOCH ${spaced(Math.max(0, goalKm - totalKm))} KM`,
          paceLabel: `${spaced(Math.abs(paceDelta))} KM ${paceAhead ? 'VOR' : 'HINTER'} PLAN`,
          paceAhead,
        }
      : null

    // ── Ride cards (real) ─────────────────────────────────────────────────────
    // ALL of them — the archive must not have a wall at ride 14. The view
    // renders the tail lazily behind its "alle anzeigen" button.
    const rides: W3RideCard[] = acts.map((a) => {
      const d = new Date(a.started_at)
      const km = a.distance_meters != null ? a.distance_meters / 1000 : null
      const dur = a.duration_seconds ?? 0
      const speed = km != null && dur > 0 ? `${(km / (dur / 3600)).toFixed(1)}` : '—'
      const pw = a.average_power ?? a.normalized_power
      // real secondary fact for the bullet: prefer climbing, else training load
      const note = a.elevation_gain_m != null && a.elevation_gain_m > 0
        ? `${Math.round(a.elevation_gain_m)} Höhenmeter`
        : a.tss != null && a.tss > 0
          ? `${Math.round(a.tss)} TSS`
          : null
      return {
        id: a.id,
        title: a.title ?? 'Fahrt',
        dateLabel: dateLabel(d),
        km: km != null ? (km >= 100 ? km.toFixed(1) : km.toFixed(2)) : '—',
        speed,
        power: pw != null ? `${Math.round(pw)}` : '—',
        dur: dur > 0 ? hm(dur) : '—',
        note,
        indoor: !(a.route_polyline && a.route_polyline.length > 1),
        race: RACE_RE.test(a.title ?? ''),
        recent: (now.getTime() - d.getTime()) <= 7 * 864e5,
        polyline: a.route_polyline ?? null,
      }
    })

    return {
      title: 'Fahrten',
      loggedLabel: 'ERFASST',
      count: `${acts.length} ${acts.length === 1 ? 'Fahrt' : 'Fahrten'}`,
      seasonLabel: 'SAISON GESAMT',
      totalKm: spaced(totalKm),
      totalUnit: 'km',
      ofGoalLabel: 'VOM ZIEL',
      bars,
      barMonths,
      barsAccentFrom: 7, // trailing 5 months render acid, matching the pen
      avgSpeed,
      avgPower,
      saddleTime,
      rides,
      // Real season goal, or null → the dock invites the rider to set one and
      // the meter counts ridden months instead of progress toward fiction.
      goal,
      prAnnounce,
    }
  }, [data, now, goalKm])

  return <W3RidesView vm={vm} />
}
