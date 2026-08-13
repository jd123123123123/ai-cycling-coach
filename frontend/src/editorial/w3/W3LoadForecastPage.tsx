import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useCurrentWeek } from '../../hooks/useCurrentWeek'
import { useAthleteProfile } from '../../hooks/useAthleteProfile'
import { fetchPlanChangeInterview } from '../../api/plan'
import { weekZoneSeconds, fmtHoursHM } from './w3plan'
import W3LoadForecastView, { type W3LoadVm, type ZoneRow } from './W3LoadForecastView'

/**
 * W3 · BELASTUNG & PROGNOSE, wired to real data. Route /e/w3-load.
 *
 * Real: time-in-zone summed from the week's planned intervals (`useCurrentWeek`
 * → `weekZoneSeconds`), the race-day performance projection with its 80% band
 * (`useCurrentWeek.projection`), and the athlete's real compliance over the last
 * block (`/plan/change/interview` → `current`). "Ziel im Aufbau" 80/20 is the
 * DERIVED build-phase polarization target.
 */

const hm = (sec: number) => `${Math.floor(sec / 3600)}:${String(Math.round((sec % 3600) / 60)).padStart(2, '0')}`

export default function W3LoadForecastPage() {
  const navigate = useNavigate()
  const { data: week } = useCurrentWeek(0)
  const { data: profile } = useAthleteProfile()
  const { data: interview } = useQuery({
    queryKey: ['plan', 'change', 'interview'],
    queryFn: () => fetchPlanChangeInterview(),
    staleTime: 10 * 60 * 1000,
    retry: false,
  })

  const vm = useMemo<W3LoadVm>(() => {
    const days = week?.days ?? []
    const z = weekZoneSeconds(days)
    const totalSec = z.reduce((s, v) => s + v, 0)
    const zones: ZoneRow[] = z.map((sec, i) => ({ label: `Z${i + 1}`, time: totalSec > 0 ? hm(sec) : '—', frac: sec }))

    const easySec = z[0] + z[1]
    const hardSec = z[2] + z[3] + z[4]
    const denom = easySec + hardSec
    const deineWoche = denom > 0
      ? { easy: Math.round((easySec / denom) * 100), hard: Math.round((hardSec / denom) * 100) }
      : null
    if (deineWoche) deineWoche.hard = 100 - deineWoche.easy

    const proj = week?.projection ?? null
    const weight = profile?.weight_kg ?? null
    const usable = proj != null && proj.mode !== 'insufficient' && proj.projected_central != null
    const central = usable ? Math.round(proj!.projected_central!) : null
    const band = proj?.band_80 ?? null
    const low = band ? Math.round(band[0]) : (central != null && proj?.current_estimate != null ? Math.round(proj.current_estimate) : null)
    const high = band ? Math.round(band[1]) : (central != null ? Math.round(central * 1.03) : null)
    const cur = proj?.current_estimate != null ? Math.round(proj.current_estimate) : null
    const delta = central != null && cur != null ? central - cur : null
    const wkg = central != null && weight != null ? (central / weight).toFixed(1).replace('.', ',') : null
    const rangePos = central != null && low != null && high != null && high > low
      ? Math.max(0.04, Math.min(0.96, (central - low) / (high - low)))
      : 0.5

    const c = interview?.current ?? null
    const done = c?.sessions_done ?? null
    const planned = c?.planned_sessions ?? null
    const pct = c?.compliance_pct != null ? Math.round(c.compliance_pct) : (done != null && planned ? Math.round((done / planned) * 100) : null)

    const unit = proj?.unit || 'W'

    return {
      intro: 'Verteilung dieser Woche, deine Umsetzung der letzten vier Wochen und was daraus bis zum Renntag wird.',
      weekHours: totalSec > 0 ? `${fmtHoursHM(totalSec / 3600)} h` : '—',
      zones,
      deineWoche,
      zielAufbau: { easy: 80, hard: 20 },
      balanceNote: deineWoche
        ? (deineWoche.hard > 20
          ? 'Leicht über dem Zielkorridor – wenn eine harte Einheit schwer fällt, kürzt der Plan die VO2max-Einheit.'
          : 'Im Zielkorridor – der lockere Anteil trägt die harten Einheiten.')
        : 'Das Verhältnis erscheint, sobald diese Woche Einheiten mit Leistungsdaten hat.',
      forecastSub: proj?.samples_used ? `Hochrechnung aus ${proj.samples_used} Trainingsdaten` : 'Hochrechnung aus deinen Trainingsdaten',
      threshold: central != null ? String(central) : '—',
      thresholdUnit: central != null ? `${unit}${wkg ? ` · ${wkg} W/kg` : ''}` : (proj?.metric_label ?? 'Schwelle'),
      delta: delta != null && delta !== 0 ? `${delta > 0 ? '+' : ''}${delta} ${unit}` : null,
      rangeLow: { v: low != null ? `${low} ${unit}` : '—', l: 'wenn du kürzt' },
      rangeMid: { v: central != null ? `${central} ${unit}` : '—', l: 'erwartet' },
      rangeHigh: { v: high != null ? `${high} ${unit}` : '—', l: 'voll umgesetzt' },
      rangePos,
      compliancePct: pct != null ? `${pct} %` : '—',
      complianceDone: done ?? 0,
      complianceTotal: planned && planned > 0 ? Math.min(40, planned) : 0,
      complianceNote: done != null && planned != null
        ? `${done} von ${planned} Einheiten gefahren. Gekürzt wurden vor allem die langen Fahrten – genau die, auf die es am Ziel ankommt.`
        : 'Die Umsetzung erscheint nach den ersten Wochen im Plan.',
    }
  }, [week, profile, interview])

  return (
    <W3LoadForecastView vm={vm} onBack={() => navigate(-1)} onAdjust={() => navigate('/e/w3-plan')} />
  )
}
